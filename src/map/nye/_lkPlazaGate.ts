import { Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { BAYON_STONE, bondTone, carveFace, courseShade, FACE_TINY, fillBox, tone, type Side, type StoneTones } from '../landmarks/_faces';
import { Frame, type Lamps } from '../landmarks/_prasatKit';
import type { StairNagaSpec } from '../sacred/naga';
import { LAKE_AVENUE, LAKE_GATE, LAKE_NAGA, LAKE_WALL, lakeFacingIn, lakePlazaAt } from './plan';
import { hangingBanner, khmerLamp, LATERITE, PAVER, PAVER_LIGHT, pick, POST_STONE } from './_sqKit';
import { fireBowl, GOLD, LACQUER, towerLantern, type Bodies } from './_lkKit';
import type { PlazaPools } from './_lkPlazaLight';

/**
 * The lake plaza's land gate and its avenue (AWP-35, the owner's lake reference; where: plan.ts `LAKE_GATE`,
 * `LAKE_AVENUE`): as at Angkor Thom, a causeway between naga balustrades leads to a stone gopura with a Bayon face on
 * each side of its tower.
 *
 * - **The gate** on the ring wall's line, facing out along the avenue: a sandstone gopura on a fine 0.22 m grid (the
 *   Kulen square's gate, `_sqGate.ts`, smaller: a fraction of the stage's height, as the reference's), its cells laid
 *   flush (no jitter: no checkerboard of seams): wings with false balustered windows either side of a passage 2.4 m
 *   wide and 2.6 m high under a corbelled top (no true arch), a moulded base and cornice, and over the passage a tower
 *   with the Bayon's smiling face on all four sides (landmarks/_faces.ts `FACE_TINY`), stepped tiers and a lotus bud
 *   (≈ 8.8 m). Fire bowls burn on the cornice's outer corners; lanterns hang in the passage, oil lamps glow in the
 *   false windows; the plaza's real light stands low before it (lake.ts), so the face is lit warm from below. Built
 *   square in a builder of its own and set on the map turned (`Frame.place`).
 * - **The naga balustrades** either side of the avenue's last 7 m: a seven-headed cobra with one smooth fan hood rearing
 *   on a pedestal at the outer end, facing whoever comes up the avenue, its body running along stone posts to a
 *   pedestal by the gate (sacred/naga.ts `stairNaga`, sculpted by lake.ts; `naga`); bronze fire bowls burn on those two
 *   pedestals, and red banners with the white Angkor Wat hang from lacquered poles behind them.
 * - **The avenue** out to where the lake trail and the east shore trail meet: pale slabs down the middle, sandstone
 *   either side, laterite kerbs, Khmer lamps on stone posts in pairs along it.
 *
 * Everything is in the shore's builder (stone: solid, the passage walked through), the kit and the glowing boxes.
 */

/** The gate's grid (m) and size in cells: across (x, along the wall, 7.3 m), deep (z, + outward, 2.9 m). */
const C = 0.22;
const NI = 33;
const NK = 13;

/** The body's top row (cells): the cornice is the next. */
const TOP_ROW = 17;

/** Kulen sandstone, as the plaza's pillars and wall (the Bayon's tones warmed and lightened: it reads at night by the braziers). */
const STONE: StoneTones = {
  ...BAYON_STONE,
  wall: [0xb2a084, 0xaa987c, 0xb9a78a, 0xa49276],
  mid: [0xbcab8e, 0xb4a386, 0xc3b295],
  light: [0xc8b799, 0xc0af91, 0xcfbea0],
  bright: [0xdacaab, 0xd2c2a3, 0xe0d0b1],
  dark: [0x7e6f5a, 0x766753, 0x857661],
  deep: [0x2a241e, 0x302922, 0x26201b],
  shadow: [0x6a5e4c, 0x645846, 0x706352],
  ledge: [0xc2b194, 0xbaa98c, 0xc9b89b],
};

export interface LakeGate {
  blocks: number;
  /** The naga either side of the avenue (map m), or null on low. */
  naga: Pick<StairNagaSpec, 'fans' | 'bodies' | 'radius'> | null;
}

export function buildLakeGate(field: HeightField, out: VoxelBuilder, kit: Kit, bodies: Bodies, glow: Glow, lamps: Lamps, low: boolean, src: SourceTrace | undefined, pools: PlazaPools | null = null): LakeGate {
  const n0 = out.boxes.length;
  const phi = LAKE_GATE.phi;
  const yawOut = lakeFacingIn(phi) + Math.PI;
  const [gx, gz] = lakePlazaAt(phi, LAKE_WALL.r);
  const ground = field.heightAt(gx, gz);
  // ── The gopura, square in its own builder: x along the wall, z outward ──
  const lb = new VoxelBuilder();
  gopura(lb, ground);
  const F = new Frame(gx, 0, gz, yawOut);
  F.place(lb, out);
  const occupyBox = (x0: number, z0: number, x1: number, z1: number) => {
    for (let lz = z0; lz <= z1; lz += 0.5)
      for (let lx = x0; lx <= x1; lx += 0.5) {
        const x = F.wx(lx, lz);
        const z = F.wz(lx, lz);
        field.occupy(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
      }
  };
  occupyBox(-(NI * C) / 2 - 0.5, -(NK * C) / 2 - 0.5, (NI * C) / 2 + 0.5, (NK * C) / 2 + 0.5);
  // Its night: fire bowls on the cornice at the outer corners, a tower lantern hanging in each mouth of the passage,
  // oil lamps set in the false windows' gaps.
  for (const sx of [-1, 1]) {
    const lx = sx * ((NI * C) / 2 - 0.5);
    const lz = (NK * C) / 2 - 0.5;
    fireBowl(out, kit, bodies, glow, F.wx(lx, lz), ground + (TOP_ROW + 1) * C, F.wz(lx, lz), 0.95, 475 + sx, low, src, yawOut);
  }
  for (const s of [-1, 1]) {
    const [x, z] = [F.wx(0, s * ((NK * C) / 2 - 0.4)), F.wz(0, s * ((NK * C) / 2 - 0.4))];
    // (high in the corbelled top: its foot ≈ 2.45 m up, clear of his head, 2.26 m)
    towerLantern(out, kit, bodies, glow, x, ground + 3.48, z, 0.1, 470 + s, src, yawOut);
    for (const lx of [-2.42, 2.42])
      for (const ly of [1.15, 1.8]) {
        const fx = F.wx(lx, s * ((NK * C) / 2 + 0.03));
        const fz = F.wz(lx, s * ((NK * C) / 2 + 0.03));
        bodies.add(fx, ground + ly, fz, 0.1, 0.16, 0.06, 0xffa850, 0.95, yawOut);
        glow.add(fx, ground + ly, fz, 0xffb45a, 1.1, { level: 0.6 });
      }
  }

  // The passage paved as the plaza and the avenue (the grid's own floor is the land's height: grass showed through).
  {
    const [px, pz] = [F.wx(0, 0), F.wz(0, 0)];
    out.box(px, ground + 0.08 - 0.15, pz, 2.5, 0.3, NK * C + 0.1, 0xc6b393, 'mapStone', { src, ry: yawOut, shade: 0.97 });
  }

  // ── The avenue, in the gate's frame: lx across, lz outward from the gate's middle ──
  const W = LAKE_AVENUE.w;
  const z0 = (NK * C) / 2;
  const z1 = LAKE_AVENUE.r1 - LAKE_WALL.r;
  const at = (lx: number, lz: number): [number, number] => [F.wx(lx, lz), F.wz(lx, lz)];
  let end = z0;
  for (let lz = z0 + 0.5; lz < z1; lz += 1) {
    // (it stops at the first trail's tread, water or a land step)
    const [x, z] = at(0, lz);
    const c = field.index(x, z);
    if (c < 0 || field.trail[c] === 2 || field.waterAt(x, z) !== null || Math.abs(field.heightAt(x, z) - ground) > 0.6) break;
    end = lz + 0.5;
    for (let lx = -W / 2 + 0.5; lx < W / 2; lx += 1) {
      const [px, pz] = at(lx, lz);
      const g = field.heightAt(px, pz);
      const mid = Math.abs(lx) < 1;
      const col = mid ? pick(PAVER_LIGHT, lx, lz, 1, 431) : pick(PAVER, lx, lz, 2, 431);
      out.box(px, g + 0.08 - 0.15, pz, 1.0, 0.3, 1.0, col, 'mapStone', { src, ry: yawOut, shade: 0.95 + 0.08 * hash3(lx, lz, 3, 431) });
    }
    for (const s of [-1, 1]) {
      const [px, pz] = at(s * (W / 2 + 0.2), lz);
      out.box(px, field.heightAt(px, pz) + 0.02, pz, 0.4, 0.3, 1.02, pick(LATERITE, s, lz, 4, 431), 'mapStone', { src, ry: yawOut, shade: 0.93 });
    }
    const [ox, oz] = at(0, lz);
    field.occupy(ox - 2.8, oz - 2.8, ox + 2.8, oz + 2.8);
  }

  // ── The naga's pedestals and posts (the balustrades' stone), braziers by the gate, banners ──
  // (where: plan.ts `LAKE_NAGA`, as the walk map's overlay has them, roam/_nyePlazaWalk.ts)
  const kerb = LAKE_NAGA.kerb;
  const footZ = LAKE_NAGA.foot;
  const headZ = Math.min(LAKE_NAGA.head, end - 1);
  const railY = 0.78;
  for (const s of [-1, 1]) {
    // The pedestal by the gate (a fire bowl on it) and the one at the outer end (the hood rears on it).
    for (const [lz, w, h] of [
      [footZ, 1.1, 1.0],
      [headZ, 1.25, 0.62],
    ] as const) {
      const [px, pz] = at(s * kerb, lz);
      const g = field.heightAt(px, pz);
      out.box(px, g + 0.1, pz, w + 0.2, 0.3, w + 0.2, pick(LATERITE, s, lz, 5, 432), 'mapStone', { src, ry: yawOut, shade: 0.95 });
      out.box(px, g + 0.25 + (h - 0.25) / 2, pz, w, h - 0.25, w, pick(POST_STONE, s, lz, 6, 432), 'mapStone', { src, ry: yawOut });
      out.box(px, g + h + 0.05, pz, w + 0.12, 0.1, w + 0.12, pick(POST_STONE, s, lz, 7, 432), 'mapStone', { src, ry: yawOut, shade: 1.05 });
      if (lz === footZ) fireBowl(out, kit, bodies, glow, px, g + h + 0.1, pz, 1.1, 433 + s, low, src, yawOut);
      field.occupy(px - 0.9, pz - 0.9, px + 0.9, pz + 0.9);
    }
    // Posts under the body between them (on low: a low kerb wall instead, no naga).
    if (low) {
      const [px, pz] = at(s * kerb, (footZ + headZ) / 2);
      out.box(px, field.heightAt(px, pz) + 0.3, pz, 0.45, 0.6, headZ - footZ - 1.1, pick(POST_STONE, s, 1, 8, 432), 'mapStone', { src, ry: yawOut });
    } else
      for (let lz = footZ + 1.3; lz < headZ - 0.8; lz += 1.4) {
        const [px, pz] = at(s * kerb, lz);
        const g = field.heightAt(px, pz);
        out.box(px, g + (railY - 0.12) / 2, pz, 0.26, railY - 0.12, 0.26, pick(POST_STONE, s, lz, 9, 432), 'mapStone', { src, ry: yawOut });
        out.box(px, g + 0.06, pz, 0.36, 0.12, 0.36, pick(LATERITE, s, lz, 10, 432), 'mapStone', { src, ry: yawOut, shade: 0.95 });
      }
    // A banner pole behind the balustrade, the banner facing the avenue's way in.
    const [bx, bz] = at(s * (kerb + 1.25), footZ + 1.6);
    const bg = field.heightAt(bx, bz);
    out.box(bx, bg + 0.2, bz, 0.5, 0.4, 0.5, pick(LATERITE, s, 3, 11, 432), 'mapStone', { src, ry: yawOut });
    const H = 6.4;
    out.box(bx, bg + H / 2, bz, 0.16, H, 0.16, pick(LACQUER, s, 4, 12, 432), 'mapStone', { src, ry: yawOut });
    out.box(bx, bg + H + 0.12, bz, 0.24, 0.24, 0.24, pick(GOLD, s, 5, 13, 432), 'mapStone', { src, ry: yawOut, shade: 1.08 });
    const barY = bg + H - 0.25;
    // (the bar out over the avenue's side, the banner hanging from it)
    const [cx, cz] = at(s * (kerb + 0.6), footZ + 1.6);
    out.box(cx, barY, cz, 1.4, 0.08, 0.08, pick(LACQUER, s, 6, 14, 432), 'mapStone', { src, ry: yawOut });
    hangingBanner(kit, cx, barY - 0.05, cz, yawOut, 1.0, 3.0, low, 440 + s, 0.05);
    field.occupy(bx - 0.5, bz - 0.5, bx + 0.5, bz + 0.5);
  }
  // Khmer lamps in pairs along the avenue past the naga.
  for (let lz = headZ + 3.5; lz < end - 1.5; lz += 4.5)
    for (const s of [-1, 1]) {
      const [px, pz] = at(s * (W / 2 + 0.75), lz);
      if (field.trail[field.index(px, pz)] === 2) continue;
      khmerLamp(out, px, field.heightAt(px, pz), pz, 1.3, 450 + Math.round(lz) * 2 + s, src, lamps, null, 2.3);
      pools?.add(...at(s * (W / 2 - 0.4), lz), 3, 0xffa850, 0.24);
      field.occupy(px - 0.5, pz - 0.5, px + 0.5, pz + 0.5);
    }

  // ── The naga: hoods rearing at the outer pedestals facing out, bodies along the posts to the gate's pedestals ──
  let naga: LakeGate['naga'] = null;
  if (!low) {
    const V = (lx: number, y: number, lz: number) => {
      const [x, z] = at(lx, lz);
      return new Vector3(x, y, z);
    };
    const out3 = new Vector3(Math.sin(yawOut), 0, Math.cos(yawOut));
    const gAt = (lx: number, lz: number) => field.heightAt(...at(lx, lz));
    naga = {
      fans: [-1, 1].map((s) => ({ at: V(s * kerb, gAt(s * kerb, headZ) + 0.67, headZ), look: out3.clone(), height: 2.2 })),
      bodies: [-1, 1].map((s) => {
        const k = s * kerb;
        const y = (lz: number) => gAt(k, lz) + railY;
        return {
          path: [
            V(k, gAt(k, headZ) + 0.9, headZ - 0.5),
            V(k, gAt(k, headZ) + 1.05, headZ - 0.95),
            V(k, y(headZ - 1.5) + 0.05, headZ - 1.5),
            V(k, y(headZ - 2.6), headZ - 2.6),
            V(k, y(footZ + 1.3), footZ + 1.3),
            V(k, y(footZ + 0.75) + 0.1, footZ + 0.75),
          ],
          tail: 0.9,
        };
      }),
      radius: 0.21,
    };
  }
  return { blocks: out.boxes.length - n0, naga };
}

/** The gopura on its grid, in its own frame (x across, z outward; its middle at the origin; y the map's). */
function gopura(b: VoxelBuilder, ground: number): void {
  const ox = -(NI * C) / 2;
  const oz = -(NK * C) / 2;
  // (row 0 is under the ground: the gate's foot never shows a gap)
  // (no jitter: on a grid this fine, cells standing in and out read as a checkerboard of dark seams at night)
  const g = b.grid({ cell: C, origin: [ox, ground - C, oz], mat: 'mapStone', jitter: 0, ao: 0.22, seed: 461 });
  const T = STONE;
  const seed = 461;
  const wall = (i: number, j: number, k: number) => bondTone(T.wall, i, j, k, seed);
  const ledge = (i: number, j: number, k: number) => tone(T.ledge, i, j, k, seed + 1);
  const shade = (_i: number, j: number) => courseShade(j);
  const ci = (NI - 1) / 2;
  const ck = (NK - 1) / 2;
  /** Half the passage (cells either side of the middle column) at row j, or −1 where it is closed: 2.6 m, then corbelled in. */
  const open = (j: number): number => (j >= 1 && j <= 12 ? 5 : j >= 13 && j <= 16 ? 17 - j : -1);
  const TOP = TOP_ROW;

  // ── The body: wings either side of the passage, a moulded base, a cornice ──
  fillBox(g, 0, NI - 1, 0, TOP, 0, NK - 1, (i, j, k) => (Math.abs(i - ci) <= open(j) ? null : j === 1 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', shade);
  for (const [j, outBy] of [
    [1, 1],
    [TOP + 1, 1],
  ] as const)
    for (let i = -outBy; i < NI + outBy; i++)
      for (let k = -outBy; k < NK + outBy; k++) {
        if (j === 1 && Math.abs(i - ci) <= open(j)) continue;
        if (i >= 0 && i < NI && k >= 0 && k < NK && j !== TOP + 1) continue;
        g.put(i, j, k, { color: ledge(i, j, k), mat: 'mapStone', shade: 1.04 });
      }
  // False windows in the wings (both faces): a light frame, dark gaps between turned balusters.
  for (const k of [-1, NK]) {
    const kk = k < 0 ? 0 : NK - 1;
    for (const c0 of [3, NI - 8]) {
      for (let j = 4; j <= 11; j++)
        for (let i = c0; i < c0 + 5; i++) {
          const edge = j === 4 || j === 11 || i === c0 || i === c0 + 4;
          if (edge) g.put(i, j, k, { color: tone(T.light, i, j, k, seed + 2), mat: 'mapStone', shade: 1.02 });
          else g.put(i, j, kk, { color: (i - c0) % 2 ? tone(T.mid, i, j, kk, seed) : tone(T.deep, i, j, kk, seed), mat: 'mapStone', shade: (i - c0) % 2 ? 1 : 0.8 });
        }
    }
    // The lintel over the passage, carved lighter; a pediment of three steps over it.
    for (let i = ci - 7; i <= ci + 7; i++) for (const j of [13, 14, 15, 16]) if (Math.abs(i - ci) > open(j)) g.put(i, j, k, { color: tone(T.bright, i, j, k, seed + 3), mat: 'mapStone', shade: 1 });
    for (const [j, h] of [
      [TOP + 2, 5],
      [TOP + 3, 3],
    ] as const)
      for (let i = ci - h; i <= ci + h; i++) g.put(i, j, k, { color: tone(T.light, i, j, k, seed + 4), mat: 'mapStone', shade: 1.03 });
  }
  // The passage's floor: paving through it.
  for (let i = ci - 5; i <= ci + 5; i++) for (let k = 0; k < NK; k++) g.put(i, 0, k, { color: tone(T.ledge, i, 0, k, seed + 4), mat: 'mapStone', shade: 0.95 });

  // ── The tower: a plinth, the faces, a cornice, stepped tiers, the lotus bud ──
  const square = (h: number, j0: number, j1: number, color: (i: number, j: number, k: number) => number, notch = true) =>
    fillBox(g, ci - h, ci + h, j0, j1, ck - h, ck + h, (i, j, k) => (notch && Math.abs(i - ci) === h && Math.abs(k - ck) === h ? null : color(i, j, k)), 'mapStone', shade);
  let j = TOP + 2;
  square(6, j, j, wall, false);
  square(6, j + 1, j + 1, ledge, false);
  const fj = j + 2;
  square(4, fj, fj + FACE_TINY.height - 1, wall, false);
  for (const side of ['S', 'E', 'N', 'W'] as Side[]) carveFace(g, { ci, ck, half: 4, j0: fj, side, face: FACE_TINY, tones: T, seed: seed + 7 });
  j = fj + FACE_TINY.height;
  square(5, j, j, ledge, false);
  j++;
  for (const [h, rows] of [
    [4, 1],
    [3, 1],
    [2, 1],
    [1, 1],
  ] as const) {
    square(h, j, j + rows - 2, wall);
    square(h, j + rows - 1, j + rows - 1, ledge);
    if (h >= 3) for (const [di, dk] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.put(ci + di * h, j + rows, ck + dk * h, { color: ledge(di, j, dk), mat: 'mapStone', shade: 1.05 });
    j += rows;
  }
  for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) if (di === 0 || dk === 0) g.put(ci + di, j, ck + dk, { color: tone(T.bright, di, j, dk, seed), mat: 'mapStone', shade: 1 });
  g.put(ci, j + 1, ck, { color: tone(T.bright, 0, j + 1, 0, seed), mat: 'mapStone', shade: 1.05 });
  g.put(ci, j + 2, ck, { color: tone(T.light, 0, j + 2, 0, seed), mat: 'mapStone', shade: 1.08 });
  // A little moss on the cornice's lip.
  g.forEach((i, jj, k, cell) => {
    if (jj === TOP + 1 && (k < 0 || k >= NK) && hash3(i, jj, k, seed + 9) < 0.16) cell.color = tone(T.moss, i, jj, k, seed);
  });
  g.commit();
}
