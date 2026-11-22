import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import type { StairNagaSpec } from '../sacred/naga';
import { LAKE_AVENUE, LAKE_GATE, lakeWallRuns, LAKE_MANDALA, LAKE_PILLARS, LAKE_SALAS, LAKE_SHORE, LAKE_SIDE, LAKE_WALL, lakeFacingIn, lakePlazaAt, lakePlazaPolar } from './plan';
import { hangingBanner, LATERITE, PAVER, PAVER_LIGHT, pick, POST_STONE } from './_sqKit';
import { fireBowl, GOLD, lampPost, stringLights, type Bodies, type LakeFrame } from './_lkKit';
import { buildLakeGate } from './_lkPlazaGate';
import { dressPlazaGarden } from './_lkPlazaGarden';
import { PlazaPools } from './_lkPlazaLight';
import { buildLakeSalas } from './_lkPlazaSala';

/**
 * The lake venue's plaza on the shore (AWP-35; the owner's lake reference, assets/new-year-online/lake-reference.png;
 * where: plan.ts `LAKE_SHORE` and the layout under it): one round composition in front of the floating stage — the eye
 * goes from the gate up the plaza to the gold lotus in its middle, on down the jetty to the stage and the lake.
 *
 * - **The floor**: warm sandstone pavers laid in concentric rings (each stone turned to its ring, neighbours a
 *   centimetre apart in height so their bevelled edges read as joints), pale under the gold lotus mandala in the middle
 *   (its painted lines and the pools of firelight round the plaza: `_lkPlazaLight.ts`, one draw), a thin dark course
 *   round the mandala and a laterite one at the rim; the landing in square stones, a pale way to the jetty.
 * - **The ring wall**: a low, slim sandstone wall (0.9 m high, 0.5 m at its foot: walking into it stops him) on a
 *   laterite footing, coping on top (and, but on low, a band of carved panels
 *   on its inner face), in straight runs between **fire pillars** (`LAKE_PILLARS`: a moulded base, the shaft with carved
 *   panels and a gilt band, a lotus capital, a bronze fire bowl burning on top; the two big ones flank the landing), open
 *   to the landing, the land gate (`_lkPlazaGate.ts`), the side way in, and the two salas standing in its line.
 * - **Lamp posts** just outside the wall between the pillars, a tower lantern hanging from each, **string lights** from
 *   post to post round the rim and from the big pillars to the salas' eaves (bulbs as small bright points at any
 *   distance, `_sqGlow.ts` `clampBulbs`, no halos: no bloom wash); red **banners** with the white Angkor Wat on the big
 *   pillars and the side ones (`_sqKit.ts` `hangingBanner`), live fire in the bowls (`kitFire`).
 * - The salas and the food stalls (`_lkPlazaSala.ts`), the garden round the wall: flower beds, the lily pond by the
 *   gate (`_lkPlazaGarden.ts`).
 *
 * Solid where it stands (the walk map takes the stone and the timber): he walks the floor and the landing, through the
 * gate, the side way and the front; the wall stops him (0.85 m: no step up). Marks its ground with `field.occupy`.
 */

/** How far the pavers' tops stand over the land (m: as the people's `LAKE_PAVING`). */
export const TOP = 0.08;
/** The rings' width (m). */
const RING = 1.2;

/** The thin courses of darker stone (round the mandala, the carved panels' recesses). */
const DARK_COURSE = [0x6e604e, 0x675a49, 0x766753];
const GILT = [0xc9a04c, 0xbf9644, 0xd2aa56];

export interface PlazaIn {
  field: HeightField;
  b: VoxelBuilder;
  kit: Kit;
  bodies: Bodies;
  glow: Glow;
  lamps: Lamps;
  fr: LakeFrame;
  /** The bank's edge and the water's per 1 m strip across the stage's frame (v). */
  bankAt: (u: number) => { bank: number; water: number };
  /** The landing's half width across (m), from the plaza's front down to the ghat. */
  landing: number;
  low: boolean;
  src: SourceTrace | undefined;
}

export interface Plaza {
  blocks: number;
  /** Where the mandala lies (map m; its rim's radius). */
  mandala: { x: number; y: number; z: number; r: number };
  /** The naga either side of the avenue (lake.ts sculpts them), or null on low. */
  naga: Pick<StairNagaSpec, 'fans' | 'bodies' | 'radius'> | null;
  /** The big pillars' tops by the landing (−u side first): the stage's string lights tie on there. */
  front: { x: number; y: number; z: number }[];
  /** Paved (the plaza, the landing): the floor's own rule, for the garden round it. */
  paved(x: number, z: number): boolean;
  /** The pools of firelight on the ground (lake.ts adds the mandala and builds them: one draw). */
  pools: PlazaPools;
}

export function buildPlaza(o: PlazaIn): Plaza {
  const { field, b, kit, bodies, glow, lamps, fr, bankAt, low, src } = o;
  const n0 = b.boxes.length;
  const R = LAKE_SHORE.rx;
  const RW = LAKE_WALL.r;
  const land = (x: number, z: number) => field.heightAt(x, z);
  const wet = (x: number, z: number) => field.waterAt(x, z) !== null;
  const g0 = land(LAKE_SHORE.x, LAKE_SHORE.z);

  // ── The floor: concentric rings of pavers ──
  /** On the landing: across the jetty's axis within `landing`, from the bank up into the plaza. */
  const centreV = fr.local(LAKE_SHORE.x, LAKE_SHORE.z)[1];
  const onLanding = (x: number, z: number) => {
    const [u, v] = fr.local(x, z);
    return Math.abs(u) <= o.landing && v <= centreV && v >= bankAt(Math.round(u)).bank - 0.05;
  };
  const paved = (x: number, z: number) => Math.hypot(x - LAKE_SHORE.x, z - LAKE_SHORE.z) <= R || onLanding(x, z);
  // (the pools of firelight: full on the floor, the landing and the avenue, a fifth on grass)
  const [avx0, avz0] = lakePlazaAt(LAKE_AVENUE.phi, LAKE_AVENUE.r0 - 1.5);
  const [avx1, avz1] = lakePlazaAt(LAKE_AVENUE.phi, LAKE_AVENUE.r1);
  const onAvenue = (x: number, z: number) => {
    const dx = avx1 - avx0;
    const dz = avz1 - avz0;
    const t = Math.max(0, Math.min(1, ((x - avx0) * dx + (z - avz0) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - avx0 - dx * t, z - avz0 - dz * t) < LAKE_AVENUE.w / 2 + 0.3;
  };
  const pools = new PlazaPools(field, (x, z) => paved(x, z) || onAvenue(x, z), TOP);
  /** A pool `k` m in from (x, z) toward the plaza's middle. */
  const inward = (x: number, z: number, k: number): [number, number] => {
    const d = Math.hypot(LAKE_SHORE.x - x, LAKE_SHORE.z - z) || 1;
    return [x + ((LAKE_SHORE.x - x) / d) * k, z + ((LAKE_SHORE.z - z) / d) * k];
  };
  // (the whole floor faintly warm: the stones read as sandstone at night, the pools round the fires over it)
  pools.add(LAKE_SHORE.x, LAKE_SHORE.z, R + 0.5, 0xffa040, 0.06);
  // The middle stone (an octagon: two squares, one turned).
  for (const t of [0, Math.PI / 4]) b.box(LAKE_SHORE.x, g0 + TOP - 0.15 + 0.004 * (t ? 1 : 0), LAKE_SHORE.z, 1.25, 0.3, 1.25, pick(GILT, t, 1, 1, 471), 'mapStone', { src, ry: t + fr.yaw, shade: 1 });
  let pavers = 2;
  // The rings' edges: 1.2 m rings, but two thin courses of darker stone — round the mandala's rim and at the plaza's
  // rim — so the floor reads warm sandstone, the gold lotus lying on paving (the owner's reference), not on a dark disc.
  const edges: number[] = [0.6];
  const course = (r0: number, w: number) => {
    while (edges[edges.length - 1] + RING < r0 - 0.3) edges.push(edges[edges.length - 1] + RING);
    edges.push(r0, r0 + w);
  };
  course(LAKE_MANDALA.r + 0.15, 0.5);
  course(R - 0.55, 0.55);
  for (let k = 0; k + 1 < edges.length; k++) {
    const r0 = edges[k];
    const r1 = edges[k + 1];
    const rm = (r0 + r1) / 2;
    const thin = r1 - r0 < 0.8;
    const n = Math.max(8, Math.round((2 * Math.PI * rm) / (thin ? 0.9 : 1.25)));
    const len = (2 * Math.PI * r1) / n + 0.02;
    // (the stones' tone by ring: pale under the lotus, bands of pale and buff, the two thin dark courses)
    const toneOf = (i: number): [number, number] => {
      const h = hash3(k, i, 3, 472);
      if (thin && r1 >= R - 0.05) return [pick(LATERITE, k, i, 4, 472), 0.94 + 0.06 * h];
      if (thin) return [pick(DARK_COURSE, k, i, 2, 472), 0.96 + 0.06 * h];
      // (under the lotus only pale stones: a mended one there read as a dark patch on the gold, AWP-35)
      if (r1 <= LAKE_MANDALA.r + 0.2) return [pick(PAVER_LIGHT, k, i, 1, 472), 0.97 + 0.07 * h];
      // (now and then a mended stone)
      if (h < 0.025) return [pick(LATERITE, k, i, 6, 472), 0.96];
      return [Math.floor(k / 2) % 2 ? pick(PAVER, k, i, 7, 472) : pick(PAVER_LIGHT, k, i, 8, 472), 0.97 + 0.08 * h];
    };
    const off = hash3(k, 1, 1, 473) * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = off + ((i + 0.5) / n) * Math.PI * 2;
      const [x, z] = lakePlazaAt(a, rm);
      const [color, shade] = toneOf(i);
      const top = TOP + 0.012 * (k & 1) + 0.006 * (i & 1);
      b.box(x, land(x, z) + top - 0.15, z, len, 0.3, r1 - r0 + 0.03, color, 'mapStone', { src, ry: lakeFacingIn(a), shade });
      pavers++;
    }
  }
  // The landing: square stones on the stage's frame, under the rim's course where they meet it; a pale way to the jetty.
  {
    const vb = Math.min(...[-o.landing, 0, o.landing].map((u) => bankAt(u).bank));
    for (let v = Math.floor(vb) + 0.5; v < centreV; v += 1)
      for (let u = -o.landing + 0.5; u < o.landing; u += 1) {
        const [x, z] = fr.at(u, v);
        if (Math.hypot(x - LAKE_SHORE.x, z - LAKE_SHORE.z) < R - 0.25 || wet(x, z) || land(x, z) < 7.5 || !onLanding(x, z)) continue;
        const way = Math.abs(u) < 1.6;
        const color = way ? pick(PAVER_LIGHT, u, v, 1, 474) : pick(PAVER, u, v, 2, 474);
        b.box(x, land(x, z) + TOP - 0.012 - 0.15, z, 1.0, 0.3, 1.0, color, 'mapStone', { src, ry: fr.yaw, shade: 0.95 + 0.08 * hash3(u, v, 3, 474) });
        pavers++;
      }
    // (its sides: a laterite kerb with lamps on pedestals, from the plaza's rim down to the bank)
    for (const s of [-1, 1]) {
      const u = s * (o.landing + 0.3);
      const vb2 = bankAt(Math.round(s * o.landing)).bank;
      let vTop = centreV;
      for (let v = vb2; v < centreV; v += 0.25) {
        const [x, z] = fr.at(u, v);
        if (Math.hypot(x - LAKE_SHORE.x, z - LAKE_SHORE.z) < RW + 0.5) {
          vTop = v;
          break;
        }
      }
      if (vTop - vb2 < 0.8) continue;
      const [mx, mz] = fr.at(u, (vb2 + vTop) / 2);
      b.box(mx, land(mx, mz) + 0.06, mz, 0.5, 0.3, vTop - vb2, pick(LATERITE, s, 1, 5, 474), 'mapStone', { src, ry: fr.yaw, shade: 0.93 });
      for (let v = vb2 + 1.2; v < vTop - 1; v += 4.5) {
        const [lx, lz] = fr.at(u + s * 0.1, v);
        b.box(lx, land(lx, lz) + 0.35, lz, 0.6, 0.5, 0.6, pick(POST_STONE, s, v, 6, 474), 'mapStone', { src, ry: fr.yaw });
        lamps.add([lx, land(lx, lz) + 0.75, lz], 0.24, 1);
        // (the lamp's tower top, small)
        b.box(lx, land(lx, lz) + 0.62, lz, 0.5, 0.06, 0.5, pick(POST_STONE, s, v, 7, 474), 'mapStone', { src, ry: fr.yaw, shade: 1.05 });
        for (const [k, w] of [0.44, 0.32, 0.2].entries()) b.box(lx, land(lx, lz) + 0.95 + k * 0.1, lz, w, 0.1, w, pick(POST_STONE, s, k, 8, 474), 'mapStone', { src, ry: fr.yaw, shade: 1 + 0.02 * k });
        glow.add(lx, land(lx, lz) + 0.75, lz, 0xffb45a, 2, { level: 0.85 });
        pools.add(...fr.at(u - s * 1.2, v), 3, 0xffa850, 0.26);
      }
    }
  }
  // (no trees on the floor, nor where the wall and its lamps stand)
  for (let z = LAKE_SHORE.z - RW - 2; z <= LAKE_SHORE.z + RW + 2; z += 1)
    for (let x = LAKE_SHORE.x - RW - 2; x <= LAKE_SHORE.x + RW + 2; x += 1) if (Math.hypot(x - LAKE_SHORE.x, z - LAKE_SHORE.z) <= RW + 1.8 || onLanding(x, z)) field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);

  // ── The ring wall: straight runs between the pillars, round the openings ──
  for (const [a0, a1] of lakeWallRuns()) {
    // Split at the pillars inside the run (the wall runs into them), and into chords of at most 3.4 m.
    const pts: number[] = [a0];
    const inside = LAKE_PILLARS.map((p) => p.phi).map((p) => ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).filter((p) => p > a0 + 0.01 && p < a1 - 0.01).sort((p, q) => p - q);
    for (const p of [...inside, a1]) {
      const last = pts[pts.length - 1];
      const m = Math.max(1, Math.ceil(((p - last) * RW) / 3.4));
      for (let i = 1; i <= m; i++) pts.push(last + ((p - last) * i) / m);
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = lakePlazaAt(pts[i], RW);
      const [bx, bz] = lakePlazaAt(pts[i + 1], RW);
      const L = Math.hypot(bx - ax, bz - az) + 0.06;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const ry = Math.atan2(-(bz - az), bx - ax);
      const g = land(mx, mz);
      const st = (k: number) => pick(POST_STONE, mx, mz, k, 475);
      // (slim, as the Kulen square's balustrade: 0.5 m at its foot, too narrow to carry him as a terrace does)
      b.box(mx, g + 0.06, mz, L, 0.32, 0.5, pick(LATERITE, mx, mz, 1, 475), 'mapStone', { src, ry, shade: 0.93 });
      b.box(mx, g + 0.22 + 0.25, mz, L, 0.5, 0.36, st(2), 'mapStone', { src, ry, shade: 0.97 });
      b.box(mx, g + 0.77, mz, L, 0.1, 0.46, st(3), 'mapStone', { src, ry, shade: 1.05 });
      b.box(mx, g + 0.85, mz, L, 0.06, 0.3, st(4), 'mapStone', { src, ry, shade: 1.02 });
      if (!low) {
        // A band of carved panels on its inner face: a recessed dark strip, lighter dividers.
        const [, rm] = lakePlazaPolar(mx, mz);
        const inX = (LAKE_SHORE.x - mx) / rm;
        const inZ = (LAKE_SHORE.z - mz) / rm;
        b.box(mx + inX * 0.19, g + 0.47, mz + inZ * 0.19, L - 0.3, 0.26, 0.02, pick(DARK_COURSE, mx, mz, 5, 475), 'mapStone', { src, ry, shade: 0.9 });
        const k = Math.max(1, Math.round(L / 1.15));
        for (let j = 1; j < k; j++) {
          const t = j / k - 0.5;
          b.box(mx + (bx - ax) * t + inX * 0.195, g + 0.47, mz + (bz - az) * t + inZ * 0.195, 0.09, 0.3, 0.03, st(6 + j), 'mapStone', { src, ry, shade: 1.06 });
        }
      }
    }
  }

  // ── The fire pillars ──
  const front: Plaza['front'] = [];
  for (const [i, p] of LAKE_PILLARS.entries()) {
    const w = p.big ? 1.15 : 0.92;
    const H = p.big ? 3.9 : 3.1;
    const g = land(p.x, p.z);
    const ry = lakeFacingIn(p.phi);
    const st = (k: number) => pick(POST_STONE, i, k, 1, 476);
    b.box(p.x, g + 0.12, p.z, w + 0.36, 0.36, w + 0.36, pick(LATERITE, i, 1, 2, 476), 'mapStone', { src, ry, shade: 0.94 });
    b.box(p.x, g + 0.4, p.z, w + 0.18, 0.2, w + 0.18, st(3), 'mapStone', { src, ry, shade: 1.04 });
    b.box(p.x, g + 0.5 + (H - 0.5) / 2, p.z, w, H - 0.5, w, st(4), 'mapStone', { src, ry });
    // (carved panels on its four faces: a dark recess with a lighter lotus bud in it; on low a plain band)
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    for (let s = 0; s < 4; s++) {
      const a = ry + (s * Math.PI) / 2;
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      const py = g + 0.5 + (H - 0.5) * 0.48;
      b.box(p.x + nx * (w / 2 + 0.005), py, p.z + nz * (w / 2 + 0.005), w * 0.62, (H - 0.5) * 0.5, 0.02, pick(DARK_COURSE, i, s, 5, 476), 'mapStone', { src, ry: a, shade: 0.92 });
      if (!low) {
        b.box(p.x + nx * (w / 2 + 0.02), py - 0.12, p.z + nz * (w / 2 + 0.02), w * 0.2, (H - 0.5) * 0.26, 0.03, st(6 + s), 'mapStone', { src, ry: a, shade: 1.08 });
        b.box(p.x + nx * (w / 2 + 0.02), py + (H - 0.5) * 0.14, p.z + nz * (w / 2 + 0.02), w * 0.34, 0.12, 0.03, st(10 + s), 'mapStone', { src, ry: a, shade: 1.1 });
      }
    }
    b.box(p.x, g + H - 0.28, p.z, w + 0.06, 0.12, w + 0.06, pick(GOLD, i, 2, 7, 476), 'mapStone', { src, ry, shade: 0.95 });
    // The lotus capital and its abacus.
    b.box(p.x, g + H + 0.08, p.z, w + 0.2, 0.16, w + 0.2, st(14), 'mapStone', { src, ry, shade: 1.05 });
    b.box(p.x, g + H + 0.22, p.z, w + 0.32, 0.12, w + 0.32, st(15), 'mapStone', { src, ry, shade: 1.08 });
    const top = g + H + 0.28;
    fireBowl(b, kit, bodies, glow, p.x, top, p.z, p.big ? 1.5 : 1.2, 480 + i, low, src, ry);
    // (its pool of firelight on the paving, a little inside the wall)
    pools.add(...inward(p.x, p.z, 1.6), p.big ? 5.6 : 4.6, 0xffa448, p.big ? 0.4 : 0.36);
    field.occupy(p.x - w, p.z - w, p.x + w, p.z + w);
    // Banners: on the big pillars and on the sides' middle ones, hanging on the face toward the plaza's middle.
    const deg = Math.round((p.phi * 180) / Math.PI);
    if (p.big || deg === 96 || deg === -98) {
      const bw = p.big ? 0.95 : 0.8;
      const bh = p.big ? 2.5 : 2.1;
      const bx = p.x + fx * (w / 2 + 0.09);
      const bz = p.z + fz * (w / 2 + 0.09);
      b.box(bx, top - 0.38, bz, bw + 0.12, 0.07, 0.07, pick(GOLD, i, 3, 8, 476), 'mapStone', { src, ry, shade: 1 });
      hangingBanner(kit, bx, top - 0.42, bz, ry, bw, bh, low, 490 + i);
    }
    if (p.big) front.push({ x: p.x, y: top + 0.1, z: p.z });
  }
  front.sort((p, q) => fr.local(p.x, p.z)[0] - fr.local(q.x, q.z)[0]);

  // ── Lamp posts outside the wall between the pillars; string lights from post to post ──
  const RP = RW + 1.45;
  const H = low ? 4.6 : 4.8;
  const every = low ? 1.0 : 0.55;
  const ties: { phi: number; at: { x: number; y: number; z: number } }[] = [];
  const pillarPhis = LAKE_PILLARS.map((p) => p.phi).sort((p, q) => p - q);
  const blocked = (a: number) =>
    LAKE_SALAS.some((s) => Math.abs(Math.atan2(Math.sin(a - s.phi), Math.cos(a - s.phi))) < 0.3) ||
    Math.abs(Math.atan2(Math.sin(a - LAKE_GATE.phi), Math.cos(a - LAKE_GATE.phi))) < 0.32 ||
    Math.abs(Math.atan2(Math.sin(a - LAKE_SIDE.phi), Math.cos(a - LAKE_SIDE.phi))) < 0.14;
  for (let i = 0; i + 1 < pillarPhis.length; i++) {
    const a = (pillarPhis[i] + pillarPhis[i + 1]) / 2;
    if (blocked(a) || Math.abs(a) < LAKE_WALL.front) continue;
    const [x, z] = lakePlazaAt(a, RP);
    if (wet(x, z) || land(x, z) < 7.5) continue;
    ties.push({ phi: a, at: lampPost(b, kit, bodies, glow, x, land(x, z), z, H, lakeFacingIn(a), 500 + i, src) });
    pools.add(...inward(x, z, 2.2), 3.4, 0xffb058, 0.24);
    field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
  }
  // (the back's last gap: between the last pillar and the gate's wing, a post too)
  {
    const a = (pillarPhis[pillarPhis.length - 1] + (LAKE_GATE.phi + 2 * Math.PI - 0.36)) / 2;
    const [x, z] = lakePlazaAt(a, RP);
    ties.push({ phi: a, at: lampPost(b, kit, bodies, glow, x, land(x, z), z, H, lakeFacingIn(a), 530, src) });
    pools.add(...inward(x, z, 2.2), 3.4, 0xffb058, 0.24);
    field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
  }
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  ties.sort((p, q) => norm(p.phi) - norm(q.phi));
  for (let i = 0; i + 1 < ties.length; i++) {
    const p = ties[i];
    const q = ties[i + 1];
    const gap = norm(q.phi) - norm(p.phi);
    // (only neighbours along a run of wall: no string across a sala, the side way or the gate)
    const mid = norm(p.phi) + gap / 2;
    if (gap > 0.75 || blocked(mid)) continue;
    stringLights(kit, bodies, glow, p.at, q.at, 0.55, every, 0);
  }

  // ── The gate and the avenue, the salas and stalls, the garden ──
  const gate = buildLakeGate(field, b, kit, bodies, glow, lamps, low, src, pools);
  const salas = buildLakeSalas({ field, b, kit, bodies, glow, low, src, pools });
  // (the gate: its passage's mouth inside, and the braziers' light on the avenue before it)
  pools.add(...lakePlazaAt(LAKE_GATE.phi, RW - 3), 4.6, 0xffa850, 0.3);
  pools.add(...lakePlazaAt(LAKE_GATE.phi, RW + LAKE_GATE.depth / 2 + 2.2), 5.2, 0xffa040, 0.34);
  // String lights from the big pillars by the landing to the posts before the salas, on to the salas' eaves, and from
  // the salas' far corners to the posts beyond them: one string round the plaza's front half.
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const [k, s] of LAKE_SALAS.entries()) {
    const eave = salas.eaves[k];
    if (!eave) continue;
    const side = Math.sign(s.phi);
    const mine = ties.filter((t) => Math.sign(wrap(t.phi)) === side);
    const before = mine.filter((t) => Math.abs(wrap(t.phi)) < Math.abs(s.phi)).sort((p, q) => Math.abs(wrap(q.phi)) - Math.abs(wrap(p.phi)))[0];
    const after = mine.filter((t) => Math.abs(wrap(t.phi)) > Math.abs(s.phi)).sort((p, q) => Math.abs(wrap(p.phi)) - Math.abs(wrap(q.phi)))[0];
    const big = front.find((f) => Math.sign(lakePlazaPolar(f.x, f.z)[0]) === side);
    const lift = (p: { x: number; y: number; z: number }) => ({ ...p, y: p.y + 0.9 });
    if (big && before) stringLights(kit, bodies, glow, lift(big), before.at, 0.5, every, 0);
    if (before) stringLights(kit, bodies, glow, before.at, eave.near, 0.45, every, 0);
    else if (big) stringLights(kit, bodies, glow, lift(big), eave.near, 0.6, every, 0);
    if (after) stringLights(kit, bodies, glow, eave.far, after.at, 0.45, every, 0);
  }
  dressPlazaGarden({ field, b, kit, glow, low, src, paved });

  const blocks = b.boxes.length - n0;
  console.info(`[map] nye lake plaza: ${blocks} blocks (pavers ${pavers}, gate ${gate.blocks}, salas and stalls ${salas.blocks}), ${LAKE_PILLARS.length} fire pillars, ${ties.length} lamp posts`);
  return { blocks, mandala: { x: LAKE_MANDALA.x, y: g0 + TOP + 0.035, z: LAKE_MANDALA.z, r: LAKE_MANDALA.r }, naga: gate.naga, front, paved, pools };
}
