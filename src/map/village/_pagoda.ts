import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { Local, tone, type GlowFn, type Tones } from './_kit';
import { GLOW } from './_lights';
import { GROUND, PAGODA } from './_spots';

/**
 * The village pagoda (wat): on a white terrace on the rise south of the
 * village, facing north over the houses to the lake. A naga stair climbs to
 * the terrace between two serpents rearing up in fans of heads; the hall
 * (vihara) stands on its own plinth inside a colonnade of white pillars,
 * white walls with red shutters in gold frames; the roof in two tiers of
 * orange tiles edged in green, gold barge boards ending in hooks (hang
 * hong), gold finials (chofa) at the ridge's ends, the front part of the
 * roof stepped lower over the porch. Inside, a golden Buddha on an altar,
 * candles lit at night; two small stupas and a Buddhist flag by the stair.
 *
 * World metres; the hall's axis runs north–south at `PAGODA.x`.
 */

const WHITE: Tones = [0xf0e9da, 0xe9e1cf, 0xf4eee2, 0xe4dccb];
const TERRACE: Tones = [0xd6cfc0, 0xcdc5b4, 0xdcd5c6, 0xc6bdab];
const YELLOW: Tones = [0xe2b85a, 0xd9ad4e];
const ORANGE: Tones = [0xd4632c, 0xc95a28, 0xdc6e34, 0xc2532a, 0xd06a30];
const GREEN: Tones = [0x2f7050, 0x356f4c, 0x2a6648];
const RED: Tones = [0x9c2e24, 0xa8342a, 0x922a22];
const GOLD: Tones = [0xd9a93a, 0xe6b84a, 0xcc9a32];
const NAGA: Tones = [0x3f8a5a, 0x4a9a64, 0x378050];

/** The roof: eaves at ±`EAVE` m from the axis over the colonnade, a lower skirt up to ±`SKIRT`, the upper roof from ±`UPPER` to the ridge. */
const EAVE = 7;
const SKIRT = 4.5;
const UPPER = 4.8;
const RUN = 0.5;
const RISE = 0.45;
/** Height of the eaves (m) over the main hall; the porch's roof is `PORCH_DROP` lower. */
const EAVE_Y = PAGODA.floor + 4.3;
const PORCH_DROP = 1.6;
/** The roof's ends along z (m): the porch part from `Z_FRONT` to `Z_STEP`, the hall's from there to `Z_BACK`. */
const Z_FRONT = 94.1;
const Z_STEP = 96.6;
const Z_BACK = 114.4;
/** The hall's walls: ±`HALL` m from the axis, from `PAGODA.doorZ` to `HALL_BACK`. */
const HALL = 4;
const HALL_BACK = 112.5;

/** Bottom of the upper roof's first row (m), over eaves at `eave`: it overlaps the skirt's last row. */
const upperEave = (eave: number) => eave + ((EAVE - SKIRT) / RUN) * RISE - 0.25;

/** Bottom of the roof over |x − axis| = `a` (m), for a part of the roof whose eaves are at `eave` (m). */
function roofBottom(a: number, eave: number): number {
  const up = a < UPPER ? upperEave(eave) + Math.floor((UPPER - a) / RUN) * RISE : Infinity;
  const skirt = a >= SKIRT && a <= EAVE ? eave + Math.floor((EAVE - a) / RUN) * RISE : Infinity;
  return Math.min(up, skirt);
}

export interface PagodaOut {
  /** Where the explorer kneels (on the porch, before the door) and what he faces (the Buddha through the door). */
  worship: { x: number; y: number; z: number; fx: number; fz: number };
}

export function buildPagoda(field: HeightField, world: VoxelBuilder, glow: GlowFn): PagodaOut {
  const src = traceSource();
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 3301);
  const X = PAGODA.x;
  const T = PAGODA.terrace;
  const F = PAGODA.floor;
  const g = (x: number, z: number) => field.heightAt(x, z);

  // ── The terrace: 2 m stones from the ground up, a coping and a low white balustrade ──
  for (let z = T.z0; z < T.z1 - 0.01; z += 2)
    for (let x = T.x0; x < T.x1 - 0.01; x += 2) {
      const lo = Math.min(g(x + 0.2, z + 0.2), g(x + 1.8, z + 0.2), g(x + 0.2, z + 1.8), g(x + 1.8, z + 1.8));
      const edge = x === T.x0 || z === T.z0 || x + 2 >= T.x1 - 0.01 || z + 2 >= T.z1 - 0.01;
      L.span(x, lo - 0.4, z, x + 2, T.y, z + 2, tone(TERRACE, L.r(x, z, 1)), 'mapStone', edge ? 0.94 : 0.98 + L.r(z, x, 2) * 0.06);
    }
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    L.span(x0, T.y, z0, x1, T.y + 0.55, z1, tone(WHITE, L.r(x0, z0, 3)), 'mapStone');
    L.span(x0 - 0.05, T.y + 0.55, z0 - 0.05, x1 + 0.05, T.y + 0.7, z1 + 0.05, tone(YELLOW, 0.3), 'mapStone');
  };
  const S = PAGODA.stair;
  rail(T.x0, T.z0, S.x0 - 1, T.z0 + 0.4);
  rail(S.x1 + 1, T.z0, T.x1, T.z0 + 0.4);
  rail(T.x0, T.z1 - 0.4, T.x1, T.z1);
  rail(T.x0, T.z0 + 0.4, T.x0 + 0.4, T.z1 - 0.4);
  rail(T.x1 - 0.4, T.z0 + 0.4, T.x1, T.z1 - 0.4);

  // ── The naga stair: six steps, the serpents' bodies along its cheeks, their heads fanned at its foot ──
  const steps = Math.round((T.y - GROUND) / 0.5);
  const run = (S.z1 - S.z0) / steps;
  for (let i = 0; i < steps; i++) {
    const z = S.z0 + i * run;
    const top = GROUND + (i + 1) * 0.5;
    L.span(S.x0, Math.min(g(S.x0, z), g(S.x1, z)) - 0.3, z, S.x1, top, z + run, tone(TERRACE, L.r(i, 4)), 'mapStone', 0.96);
    for (const [c0, c1] of [
      [S.x0 - 1, S.x0],
      [S.x1, S.x1 + 1],
    ]) {
      L.span(c0, g(c0 + 0.5, z) - 0.3, z, c1, top + 0.45, z + run, tone(WHITE, L.r(i, c0, 5)), 'mapStone');
      // The body: green scales, a gold crest.
      L.span(c0 + 0.15, top + 0.45, z - 0.05, c1 - 0.15, top + 0.9, z + run + 0.05, tone(NAGA, L.r(i, c0, 6)), 'mapStone');
      L.span(c0 + 0.35, top + 0.9, z, c1 - 0.35, top + 1.05, z + run, tone(GOLD, 0.2), 'brass');
    }
  }
  // Pedestals at the foot, the bodies rearing into fans of seven heads looking north down the path.
  for (const cx of [S.x0 - 0.5, S.x1 + 0.5]) {
    const z = S.z0 - 0.6;
    L.span(cx - 0.8, g(cx, z) - 0.3, z - 0.7, cx + 0.8, GROUND + 1.0, z + 0.7, tone(WHITE, 0.4), 'mapStone');
    L.span(cx - 0.85, GROUND + 1.0, z - 0.75, cx + 0.85, GROUND + 1.12, z + 0.75, tone(YELLOW, 0.5), 'mapStone');
    L.span(cx - 0.3, GROUND + 1.12, z + 0.1, cx + 0.3, GROUND + 2.2, z + 0.55, tone(NAGA, 0.5), 'mapStone');
    // The hood: a flat fan widening upward, seven heads along its rim, each snout pointing north.
    const hood = [0.3, 0.5, 0.68, 0.82, 0.92];
    hood.forEach((hw, r) => {
      L.span(cx - hw, GROUND + 1.9 + r * 0.3, z - 0.12, cx + hw, GROUND + 2.2 + r * 0.3, z + 0.18, tone(GOLD, L.r(r, cx, 7)), 'brass');
    });
    L.span(cx - 0.55, GROUND + 2.0, z - 0.16, cx + 0.55, GROUND + 3.2, z - 0.1, tone(NAGA, 0.2), 'mapStone');
    for (let k = -3; k <= 3; k++) {
      const a = (k / 3) * 1.05;
      const hx = cx + Math.sin(a) * 0.95;
      const hy = GROUND + 2.95 + Math.cos(a) * 0.55;
      L.box(hx, hy, z - 0.05, 0.24, 0.3, 0.3, tone(GOLD, L.r(k, cx, 8)), 'brass');
      L.box(hx, hy - 0.05, z - 0.3, 0.16, 0.14, 0.24, tone(GOLD, 0.9), 'brass');
    }
    glow(cx, GROUND + 3.95, z + 0.1, 0.18, 0.26, 0.18, GLOW.lantern, 1.4);
    L.box(cx, GROUND + 3.72, z + 0.1, 0.3, 0.12, 0.3, tone(GOLD, 0.1), 'brass');
  }

  // ── The hall's plinth and front steps ─────────────────────────────────────
  const px0 = X - 6;
  const px1 = X + 6;
  const pz0 = 94.5;
  const pz1 = 114;
  for (let z = pz0; z < pz1 - 0.01; z += 2)
    for (let x = px0; x < px1 - 0.01; x += 2) L.span(x, T.y - 0.1, z, x + 2, F, Math.min(pz1, z + 2), tone(WHITE, L.r(x, z, 8)), 'mapStone', 0.97);
  L.span(px0 - 0.05, T.y + 0.15, pz0 - 0.05, px1 + 0.05, T.y + 0.4, pz1 + 0.05, tone(YELLOW, 0.2), 'mapStone');
  L.span(X - 2, T.y, pz0 - 1, X + 2, T.y + 0.5, pz0, tone(TERRACE, 0.5), 'mapStone');

  // ── The colonnade ─────────────────────────────────────────────────────────
  const eaveAt = (z: number) => (z < Z_STEP ? EAVE_Y - PORCH_DROP : EAVE_Y);
  const pillar = (x: number, z: number, beam: number) => {
    const top = beam - 0.35;
    L.span(x - 0.25, F, z - 0.25, x + 0.25, top - 0.3, z + 0.25, tone(WHITE, L.r(x, z, 9)), 'mapStone');
    L.span(x - 0.35, top - 0.3, z - 0.35, x + 0.35, top, z + 0.35, tone(GOLD, L.r(x, z, 10)), 'brass');
    L.span(x - 0.32, F, z - 0.32, x + 0.32, F + 0.4, z + 0.32, tone(YELLOW, 0.6), 'mapStone');
  };
  const colZ: number[] = [];
  for (let i = 0; i < 9; i++) colZ.push(95 + ((pz1 - 0.5 - 95) * i) / 8);
  const zFront = colZ[0];
  const zRear = colZ[colZ.length - 1];
  for (const z of colZ) for (const s of [-1, 1]) pillar(X + s * 5.55, z, eaveAt(z));
  // The nave's pillars at the front and back reach up to the upper roof, the gables stand on them.
  for (const z of [zFront, zRear]) {
    const up = upperEave(eaveAt(z));
    for (const x of [X - 3.2, X + 3.2]) pillar(x, z, up);
    L.span(X - UPPER, up - 0.35, z - 0.3, X + UPPER, up, z + 0.3, tone(WHITE, 0.25), 'mapStone');
    L.span(X - UPPER, up - 0.4, z - 0.34, X + UPPER, up - 0.3, z + 0.34, tone(GOLD, 0.25), 'brass');
    for (const s of [-1, 1]) L.span(X + s * 3.2 - 0.3, eaveAt(z) - 0.35, z - 0.3, X + s * 5.85, eaveAt(z), z + 0.3, tone(WHITE, 0.25), 'mapStone');
  }
  // The beams along the sides: a frieze up to the roof, a gold line along its foot.
  for (const s of [-1, 1]) {
    for (const [a, b] of [
      [pz0 + 0.2, Z_STEP],
      [Z_STEP, pz1 - 0.2],
    ]) {
      const e = eaveAt(a + 0.1);
      L.span(X + s * 5.55 - 0.3, e - 0.35, a, X + s * 5.55 + 0.3, roofBottom(5.8, e) + 0.1, b, tone(WHITE, 0.2), 'mapStone');
      L.span(X + s * 5.55 - 0.34, e - 0.35, a, X + s * 5.55 + 0.34, e - 0.2, b, tone(GOLD, 0.3), 'brass');
    }
  }

  // ── The hall: walls up under the roof, tall windows with red shutters, the open door ──
  const Z0 = PAGODA.doorZ;
  const wallTop = roofBottom(HALL, EAVE_Y);
  const winZ: number[] = [];
  for (let z = Z0 + 2; z < HALL_BACK - 1; z += 2.4) winZ.push(z);
  for (const s of [-1, 1]) {
    const x = X + s * HALL;
    let z = Z0;
    const segs: [number, number][] = [];
    for (const wz of winZ) {
      segs.push([z, wz - 0.55]);
      z = wz + 0.55;
    }
    segs.push([z, HALL_BACK]);
    for (const [a, b] of segs) L.span(x - 0.2, F, a, x + 0.2, wallTop, b, tone(WHITE, L.r(a, s, 11)), 'mapStone');
    for (const wz of winZ) {
      L.span(x - 0.2, F, wz - 0.55, x + 0.2, F + 1.4, wz + 0.55, tone(WHITE, L.r(wz, s, 12)), 'mapStone');
      L.span(x - 0.2, F + 3.4, wz - 0.55, x + 0.2, wallTop, wz + 0.55, tone(WHITE, L.r(wz, s, 13)), 'mapStone');
      glow(x, F + 2.4, wz, 0.2, 2.0, 1.1, GLOW.hall);
      // Gold frame, red shutters opened out.
      L.span(x + s * 0.2, F + 1.3, wz - 0.65, x + s * 0.3, F + 1.45, wz + 0.65, tone(GOLD, 0.5), 'brass');
      L.span(x + s * 0.2, F + 3.35, wz - 0.65, x + s * 0.3, F + 3.6, wz + 0.65, tone(GOLD, 0.5), 'brass');
      for (const d of [-1, 1]) L.span(x + s * 0.22, F + 1.45, wz + d * 0.6, x + s * 0.3, F + 3.35, wz + d * 1.15, tone(RED, L.r(wz, d, 14)), 'mapStone');
    }
    L.span(x - 0.25, F, Z0, x + 0.25, F + 0.35, HALL_BACK, tone(YELLOW, 0.4), 'mapStone');
  }
  // Front wall: the door (2 m by 3 m) in a gold frame, its red leaves open; back wall plain.
  const front = (a: number, b: number, y0: number, y1: number) => L.span(a, y0, Z0 - 0.2, b, y1, Z0 + 0.2, tone(WHITE, L.r(a, y0, 15)), 'mapStone');
  front(X - HALL, X - 1, F, wallTop);
  front(X + 1, X + HALL, F, wallTop);
  front(X - 1, X + 1, F + 3, wallTop);
  L.span(X - 1.2, F, Z0 - 0.3, X - 1.0, F + 3.2, Z0 - 0.2, tone(GOLD, 0.2), 'brass');
  L.span(X + 1.0, F, Z0 - 0.3, X + 1.2, F + 3.2, Z0 - 0.2, tone(GOLD, 0.2), 'brass');
  L.span(X - 1.2, F + 3.0, Z0 - 0.3, X + 1.2, F + 3.25, Z0 - 0.2, tone(GOLD, 0.2), 'brass');
  for (const s of [-1, 1]) L.span(X + s * 1.05, F, Z0 - 1.0, X + s * 1.15, F + 2.95, Z0 - 0.3, tone(RED, 0.5), 'mapStone');
  L.span(X - HALL, F, HALL_BACK - 0.2, X + HALL, wallTop, HALL_BACK + 0.2, tone(WHITE, 0.6), 'mapStone');

  // ── Inside: a golden Buddha on a red altar at the back, candles before him ──
  const bz = HALL_BACK - 1.6;
  L.span(X - 1.6, F, bz - 0.9, X + 1.6, F + 1.0, bz + 1.2, tone(RED, 0.3), 'mapStone');
  L.span(X - 1.7, F + 1.0, bz - 1.0, X + 1.7, F + 1.12, bz + 1.3, tone(GOLD, 0.4), 'brass');
  L.span(X - 1.2, F + 1.12, bz - 0.4, X + 1.2, F + 1.62, bz + 0.6, tone(GOLD, 0.1), 'brass');
  L.span(X - 0.55, F + 1.62, bz - 0.1, X + 0.55, F + 2.75, bz + 0.5, tone(GOLD, 0.6), 'brass');
  L.span(X - 0.3, F + 2.75, bz - 0.05, X + 0.3, F + 3.3, bz + 0.45, tone(GOLD, 0.9), 'brass');
  L.span(X - 0.1, F + 3.3, bz + 0.1, X + 0.1, F + 3.65, bz + 0.3, tone(GOLD, 0.3), 'brass');
  // Behind him the candle-lit wall glows at night (a dark red cloth by day); candles on the altar's step.
  glow(X, F + 2.65, bz + 1.28, 2.6, 3.3, 0.1, GLOW.hall);
  L.span(X - 1.45, F + 1.0, bz + 1.35, X + 1.45, F + 4.45, bz + 1.45, tone(GOLD, 0.7), 'brass');
  for (let k = -2; k <= 2; k++) glow(X + k * 0.45, F + 1.25, bz - 1.2, 0.1, 0.25, 0.1, GLOW.lantern, k === 0 ? 1.2 : 0);

  // ── The roof ──────────────────────────────────────────────────────────────
  // (za, zb, eaves, the ends that show: the porch's back end is under the hall's roof)
  const sections: [number, number, number, number[]][] = [
    [Z_FRONT, Z_STEP, EAVE_Y - PORCH_DROP, [Z_FRONT]],
    [Z_STEP, Z_BACK, EAVE_Y, [Z_STEP, Z_BACK]],
  ];
  for (const [za, zb, eave, ends] of sections) {
    const tiers: [number, number, number][] = [
      [EAVE, SKIRT, eave],
      [UPPER, 0, upperEave(eave)],
    ];
    for (const [from, to, y0] of tiers) {
      const rows = Math.ceil((from - to) / RUN - 1e-6);
      for (let k = 0; k < rows; k++) {
        const outer = from - k * RUN;
        const inner = Math.max(to, outer - RUN);
        const y = y0 + k * RISE;
        const ridge = to === 0 && inner <= 1e-6;
        const color = (z: number) => (k === 0 ? tone(GREEN, L.r(z, k, 16)) : tone(ORANGE, L.r(z, k + y0, 17)));
        for (const s of [-1, 1]) {
          if (ridge && s > 0) break;
          const xa = ridge ? X - outer : s < 0 ? X - outer : X + inner;
          const xb = ridge ? X + outer : s < 0 ? X - inner : X + outer;
          for (let z = za, i = 0; z < zb - 0.05; i++) {
            const e = Math.min(zb, z + 1.4 + L.r(i, k, 18) * 1.2);
            L.span(xa, y, z, xb, y + RISE + 0.05, e, color(z + i), 'mapStone', k % 3 === 2 ? 0.92 : 1);
            z = e;
          }
          // Gold barge boards at the gable ends, ending low in upturned hooks.
          for (const zg of ends) {
            const out = zg === za ? -1 : 1;
            L.span(xa, y + 0.1, zg + out * 0.15 - 0.15, xb, y + RISE + 0.2, zg + out * 0.15 + 0.15, tone(GOLD, L.r(k, zg, 19)), 'brass');
            if (k === 0 && !ridge) {
              const hx = s < 0 ? X - outer - 0.1 : X + outer + 0.1;
              L.box(hx, y + 0.35, zg + out * 0.15, 0.3, 0.3, 0.3, tone(GOLD, 0.6), 'brass');
              L.box(hx + s * 0.2, y + 0.65, zg + out * 0.15, 0.2, 0.35, 0.2, tone(GOLD, 0.6), 'brass');
            }
          }
        }
        if (ridge) {
          // The ridge: gold spikes along it, a chofa rising and curling out at each end.
          const top = y + RISE + 0.05;
          for (let z = za + 1; z < zb - 0.6; z += 1.2) L.box(X, top + 0.2, z, 0.18, 0.4, 0.18, tone(GOLD, 0.4), 'brass');
          for (const zg of ends) {
            const out = zg === za ? -1 : 1;
            L.box(X, top + 0.35, zg + out * 0.1, 0.34, 0.7, 0.34, tone(GOLD, 0.1), 'brass');
            L.box(X, top + 0.9, zg + out * 0.3, 0.28, 0.5, 0.28, tone(GOLD, 0.5), 'brass');
            L.box(X, top + 1.3, zg + out * 0.55, 0.22, 0.4, 0.22, tone(GOLD, 0.9), 'brass');
            L.box(X, top + 1.5, zg + out * 0.85, 0.2, 0.2, 0.4, tone(GOLD, 0.3), 'brass');
          }
        }
      }
    }
    // The gable ends: over the nave, red boards filling the triangle under the upper roof, framed in
    // by the gold barge boards, a gold medallion in the middle; the skirt's ends stay open.
    for (const zg of ends) {
      const out = zg === za ? 1 : -1;
      const zc = zg + out * 0.4;
      const from = upperEave(eave) - 0.35;
      for (let a = -UPPER + 0.25; a < UPPER - 0.2; a += 0.5) {
        const bottom = roofBottom(Math.abs(a) + 0.25, eave);
        if (bottom - from < 0.05) continue;
        L.span(X + a - 0.25, from, zc - 0.15, X + a + 0.25, bottom, zc + 0.15, tone(RED, L.r(a, zg, 20)), 'mapStone');
      }
      const sunY = from + 1.6;
      L.box(X, sunY, zc - out * 0.2, 1.3, 1.3, 0.12, tone(GOLD, 0.5), 'brass');
      L.box(X, sunY, zc - out * 0.28, 0.7, 0.7, 0.1, tone(RED, 0.9), 'mapStone');
      L.box(X, sunY, zc - out * 0.34, 0.3, 0.3, 0.1, tone(GOLD, 0.2), 'brass');
      for (const d of [-1, 1]) L.box(X + d * 1.2, from + 0.6, zc - out * 0.2, 0.9, 0.3, 0.1, tone(GOLD, 0.8), 'brass');
      L.span(X - UPPER, from - 0.05, zc - 0.2, X + UPPER, from + 0.15, zc + 0.2, tone(GOLD, 0.7), 'brass');
    }
  }

  // ── Two stupas flanking the way up, a Buddhist flag by the stair ──────────
  for (const sx of [X - 9.5, X + 9.5]) {
    const z = 96;
    const y = T.y;
    const tiers: [number, number][] = [
      [2.4, 0.8],
      [2.0, 0.5],
      [1.6, 0.9],
      [1.2, 0.4],
    ];
    let h = y;
    tiers.forEach(([w, t], i) => {
      L.span(sx - w / 2, h, z - w / 2, sx + w / 2, h + t, z + w / 2, i === 1 ? tone(YELLOW, 0.2) : tone(WHITE, L.r(i, sx, 21)), 'mapStone');
      h += t;
    });
    L.span(sx - 0.8, h, z - 0.8, sx + 0.8, h + 1.1, z + 0.8, tone(WHITE, 0.3), 'mapStone');
    h += 1.1;
    for (let k = 0; k < 4; k++) {
      const w = 0.5 - k * 0.1;
      L.span(sx - w / 2, h, z - w / 2, sx + w / 2, h + 0.5, z + w / 2, tone(GOLD, L.r(k, sx, 22)), 'brass');
      h += 0.5;
    }
    glow(sx, T.y + 1.9, z - 1.0, 0.12, 0.3, 0.12, GLOW.lantern, 0.9);
  }
  {
    const fx = S.x1 + 2.6;
    const fz = S.z0 - 0.5;
    L.span(fx - 0.08, g(fx, fz), fz - 0.08, fx + 0.08, g(fx, fz) + 7.5, fz + 0.08, 0xd8d0c0, 'metal');
    L.box(fx, g(fx, fz) + 7.6, fz, 0.2, 0.2, 0.2, tone(GOLD, 0.2), 'brass');
    // Five colours in bands along the flag: blue, yellow, red, white, orange.
    const bands = [0x2a5ab8, 0xf0c030, 0xc8302a, 0xf2eee6, 0xe8801a];
    bands.forEach((c, i) => L.span(fx + 0.08 + i * 0.36, g(fx, fz) + 6.3, fz - 0.03, fx + 0.08 + (i + 1) * 0.36, g(fx, fz) + 7.4, fz + 0.03, c, 'petal'));
  }
  // ── A bell pavilion and a drum pavilion at the terrace's back corners ────
  for (const [px, drum] of [
    [T.x1 - 2.6, false],
    [T.x0 + 2.6, true],
  ] as [number, boolean][]) {
    const pz = T.z1 - 3;
    for (const [dx, dz] of [
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.1, 1.1],
    ])
      L.span(px + dx - 0.15, T.y, pz + dz - 0.15, px + dx + 0.15, T.y + 3.2, pz + dz + 0.15, tone(WHITE, L.r(dx, dz, 24)), 'mapStone');
    L.span(px - 1.5, T.y + 3.2, pz - 1.5, px + 1.5, T.y + 3.45, pz + 1.5, tone(GOLD, 0.5), 'brass');
    for (let k = 0; k < 3; k++) L.span(px - 1.7 + k * 0.45, T.y + 3.45 + k * 0.4, pz - 1.7 + k * 0.45, px + 1.7 - k * 0.45, T.y + 3.85 + k * 0.4, pz + 1.7 - k * 0.45, k === 0 ? tone(GREEN, 0.3) : tone(ORANGE, L.r(k, px, 25)), 'mapStone');
    L.box(px, T.y + 5.1, pz, 0.2, 0.5, 0.2, tone(GOLD, 0.2), 'brass');
    if (drum) {
      // The big temple drum (skor) on its stand, its skin facing the hall.
      L.span(px - 0.5, T.y, pz - 0.5, px + 0.5, T.y + 0.6, pz + 0.5, tone(RED, 0.4), 'mapStone');
      L.span(px - 0.7, T.y + 0.6, pz - 0.45, px + 0.7, T.y + 1.9, pz + 0.45, 0x7a3a22, 'mapStone');
      for (const s of [-1, 1]) L.span(px + s * 0.7, T.y + 0.7, pz - 0.4, px + s * 0.76, T.y + 1.8, pz + 0.4, 0xe0cfa8, 'mapStone');
    } else {
      // The bronze bell hung from a beam, a log striker beside it.
      L.span(px - 1.1, T.y + 2.9, pz - 0.08, px + 1.1, T.y + 3.05, pz + 0.08, tone(RED, 0.2), 'mapStone');
      L.box(px, T.y + 2.6, pz, 0.12, 0.4, 0.12, 0x6a5a3a, 'brass');
      L.box(px, T.y + 2.1, pz, 0.6, 0.7, 0.6, 0xb08a3a, 'brass');
      L.box(px, T.y + 1.65, pz, 0.8, 0.3, 0.8, 0xa07a30, 'brass');
      L.span(px + 0.55, T.y + 1.9, pz - 0.08, px + 1.05, T.y + 2.05, pz + 0.08, 0x6a4a30, 'mapStone');
    }
  }
  world.append(lb);

  // He kneels on the porch before the open door, facing the Buddha inside.
  return { worship: { x: X, y: F, z: Z0 - 2.2, fx: X, fz: bz } };
}
