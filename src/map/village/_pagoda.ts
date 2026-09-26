import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { buddhaStatue } from '../sacred/buddha';
import { SACRED_LAMPS } from '../sacred/finish';
import { gable } from '../sacred/gable';
import { offering, type OfferingKind, type OfferingOptionsByKind, type OfferingPiece } from '../sacred/offerings';
import { trackSacred } from '../sacred/pending';
import type { SacredSet } from '../sacred/set';
import { stupa, stupaNiche } from '../sacred/stupa';
import { Local, tone, type GlowFn, type Tones } from './_kit';
import { GLOW } from './_lights';
import { auraMesh, carpetMesh, ceilingMesh, floorMesh, friezeMesh, lacquerMesh, matMesh, muralMesh, shutterMesh, wallMesh, type Face } from './_pagodaArt';
import { GROUND, PAGODA } from './_spots';

/**
 * The village pagoda (wat): on a white terrace on the rise south of the
 * village, facing north over the houses to the lake. A naga stair climbs to
 * the terrace between two serpents rearing up in fans of heads; the hall
 * (vihara) stands on its own plinth inside a colonnade of white pillars,
 * white walls with red shutters in gold frames; the roof in two tiers of
 * orange tiles edged in green, gold barge boards ending in hooks (hang
 * hong), gold finials (chofa) at the ridge's ends, the front part of the
 * roof stepped lower over the porch. Inside (a vihara, preah vihear), the
 * gilt Buddha calling the earth to witness high on a tiered red and gold
 * altar under a flame arch, the Bodhi tree painted on the wall behind him,
 * smaller Buddhas, parasols, candles and offerings on the steps, mats and a
 * red carpet before them (the painted surfaces: _pagodaArt.ts); two white
 * stupas and a Buddhist flag by the stair.
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

/** `sacred` takes the sculpted pieces (the Buddha, the gables' carvings), in world metres. */
export function buildPagoda(field: HeightField, world: VoxelBuilder, glow: GlowFn, sacred: SacredSet): PagodaOut {
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
  // The sculpted and painted pieces are made just after the build (a few hundred ms of sculpting and
  // painting, off the part's build time); shots wait for them (sacred/pending.ts).
  const later = (make: () => void) =>
    void trackSacred(
      new Promise<void>((done) =>
        setTimeout(() => {
          try {
            make();
          } finally {
            done();
          }
        }, 0),
      ),
    );
  // The hall inside: ±IN m from the axis, from the front wall's inside (zIn) to the back wall's (zBack), a ceiling at CEIL.
  const IN = HALL - 0.2;
  const zIn = Z0 + 0.2;
  const zBack = HALL_BACK - 0.2;
  const CEIL = F + 6.6;
  const LACQ: Tones = [0x8c1d15, 0x96241a, 0x841a13];
  // (gold inside, warmer than outside's: the hall is lit by the sky through its door and windows only)
  const GILT: Tones = [0xf2b23c, 0xeaa834];
  // Faces painted with gold kbach on red lacquer (_pagodaArt.ts), the windows' shutters inside, red lacquered tops.
  const friezes: Face[] = [];
  const shutters: Face[] = [];
  const tops: Face[] = [];

  // The altar: four tiers of red lacquer stepping up and back to the Buddha, a gold lip along the
  // front and sides of each one's top and a gold foot, their faces painted. Solid: he walks round it.
  const TIERS: [number, number, number][] = [
    // half width, front (z), top
    [3.1, 106.8, F + 0.475],
    [2.5, 107.6, F + 0.95],
    [1.95, 108.4, F + 1.425],
    [1.45, 109.3, F + 1.9],
  ];
  const [TA, TB, TC] = TIERS.map((t) => t[2]);
  let ty = F;
  TIERS.forEach(([w, z0, top], i) => {
    L.span(X - w, ty, z0, X + w, top, zBack, tone(LACQ, L.r(i, 30)), 'mapStone');
    L.span(X - w - 0.03, top - 0.07, z0 - 0.03, X + w + 0.03, top + 0.012, z0 + 0.05, tone(GILT, L.r(i, 31)), 'brass');
    for (const s of [-1, 1]) L.span(Math.min(X + s * (w + 0.03), X + s * (w - 0.05)), top - 0.07, z0 + 0.05, Math.max(X + s * (w + 0.03), X + s * (w - 0.05)), top + 0.012, zBack, tone(GILT, L.r(i, 31)), 'brass');
    L.span(X - w - 0.015, ty, z0 - 0.015, X + w + 0.015, ty + 0.05, zBack, tone(GILT, 0.8), 'brass');
    tops.push({ facing: '+y', at: top + 0.003, a0: X - w + 0.05, a1: X + w - 0.05, b0: z0 + 0.05, b1: i + 1 < TIERS.length ? TIERS[i + 1][1] : zBack });
    friezes.push({ facing: '-z', at: z0 - 0.02, a0: X - w, a1: X + w, b0: ty + 0.05, b1: top - 0.07 });
    for (const s of [-1, 1]) friezes.push({ facing: s < 0 ? '-x' : '+x', at: X + s * (w + 0.02), a0: z0, a1: zBack, b0: ty + 0.05, b1: top - 0.07 });
    ty = top;
  });
  // The Buddha himself: sculpted and gilded (sacred/buddha.ts), calling the earth to witness, facing the door (north, −z).
  const bz = 110.95;
  const seat = ty;
  const BH = 3.3;
  // (his head's middle, about 0.77 of his height up: the arch's halo and the wall's light are round it)
  const head = seat + BH * 0.77;
  const buddha = sacred.add(buddhaStatue({ kind: 'pagoda', look: 'gilt', height: BH }));
  buddha.position.set(X, seat, bz);
  buddha.rotation.y = Math.PI;

  // A low offering table before the altar, where the people kneel.
  const tz0 = 105.0;
  const tz1 = 105.8;
  const tw = 1.15;
  const tt = F + 0.5;
  L.span(X - tw, F, tz0, X + tw, tt, tz1, tone(LACQ, 0.4), 'mapStone');
  L.span(X - tw - 0.03, tt - 0.05, tz0 - 0.03, X + tw + 0.03, tt + 0.012, tz0 + 0.04, tone(GILT, 0.3), 'brass');
  L.span(X - tw - 0.03, tt - 0.05, tz1 - 0.04, X + tw + 0.03, tt + 0.012, tz1 + 0.03, tone(GILT, 0.3), 'brass');
  friezes.push({ facing: '-z', at: tz0 - 0.02, a0: X - tw, a1: X + tw, b0: F + 0.03, b1: tt - 0.05 });
  tops.push({ facing: '+y', at: tt + 0.003, a0: X - tw, a1: X + tw, b0: tz0 + 0.04, b1: tz1 - 0.04 });

  // The floor: a red carpet up the middle from the door, woven mats (kantel) on each side to kneel on
  // (painted, _pagodaArt.ts; he walks over them).
  const carpet: Face = { facing: '+y', at: F + 0.012, a0: X - 0.8, a1: X + 0.8, b0: zIn + 0.1, b1: tz0 - 0.25 };
  const mats: Face[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) mats.push({ facing: '+y', at: F + 0.01, a0: Math.min(X + s * 1.05, X + s * 3.05), a1: Math.max(X + s * 1.05, X + s * 3.05), b0: zIn + 0.9 + k * 1.85, b1: zIn + 2.4 + k * 1.85 });

  // The walls inside: a red lacquered dado with a gold line along its top, ivory paint over it with a
  // gold stencil, closed shutters painted in gold in the windows, a frieze under the ceiling.
  const walls: Face[] = [];
  const W0 = F + 1.16;
  const W1 = CEIL - 0.47;
  for (const s of [-1, 1]) {
    const x = X + s * IN;
    const facing = s < 0 ? '+x' : '-x';
    L.span(Math.min(x, x - s * 0.03), F, zIn, Math.max(x, x - s * 0.03), F + 1.1, zBack, tone(LACQ, 0.6), 'mapStone');
    L.span(Math.min(x, x - s * 0.05), F + 1.1, zIn, Math.max(x, x - s * 0.05), W0, zBack, tone(GILT, 0.5), 'brass');
    let z = zIn;
    for (const wz of winZ) {
      shutters.push({ facing, at: x + s * 0.03, a0: wz - 0.55, a1: wz + 0.55, b0: F + 1.4, b1: F + 3.4 });
      walls.push({ facing, at: x - s * 0.005, a0: z, a1: wz - 0.55, b0: W0, b1: W1 });
      walls.push({ facing, at: x - s * 0.005, a0: wz - 0.55, a1: wz + 0.55, b0: F + 3.4, b1: W1 });
      walls.push({ facing, at: x - s * 0.005, a0: wz - 0.55, a1: wz + 0.55, b0: W0, b1: F + 1.4 });
      z = wz + 0.55;
    }
    walls.push({ facing, at: x - s * 0.005, a0: z, a1: zBack, b0: W0, b1: W1 });
    // (the front wall's inside, each side of the door)
    L.span(Math.min(X + s * 1.0, x), F, zIn, Math.max(X + s * 1.0, x), F + 1.1, zIn + 0.03, tone(LACQ, 0.6), 'mapStone');
    L.span(Math.min(X + s * 1.0, x), F + 1.1, zIn, Math.max(X + s * 1.0, x), W0, zIn + 0.05, tone(GILT, 0.5), 'brass');
    walls.push({ facing: '+z', at: zIn + 0.005, a0: Math.min(X + s * 1.0, x), a1: Math.max(X + s * 1.0, x), b0: W0, b1: W1 });
    friezes.push({ facing, at: x - s * 0.01, a0: zIn, a1: zBack, b0: CEIL - 0.47, b1: CEIL - 0.02 });
  }
  walls.push({ facing: '+z', at: zIn + 0.005, a0: X - 1.0, a1: X + 1.0, b0: F + 3.0, b1: W1 });
  friezes.push({ facing: '+z', at: zIn + 0.01, a0: X - IN, a1: X + IN, b0: CEIL - 0.47, b1: CEIL - 0.02 });
  friezes.push({ facing: '-z', at: zBack - 0.03, a0: X - IN, a1: X + IN, b0: CEIL - 0.47, b1: CEIL - 0.02 });
  // Tie beams across under the ceiling, red with gold undersides; brass lamps hang from the first two,
  // either side of the way to the altar (lit at night).
  for (const z of [101.8, 104.6, 107.4, 110.2]) {
    L.span(X - IN, CEIL - 0.34, z - 0.13, X + IN, CEIL, z + 0.13, tone(LACQ, 0.2), 'mapStone');
    L.span(X - IN, CEIL - 0.38, z - 0.09, X + IN, CEIL - 0.34, z + 0.09, tone(GILT, 0.6), 'brass');
    if (z > 105) continue;
    for (const s of [-1, 1]) {
      const x = X + s * 2.3;
      const y = F + 4.5;
      L.span(x - 0.015, y + 0.22, z - 0.015, x + 0.015, CEIL - 0.38, z + 0.015, 0x6a4a22, 'metal');
      L.box(x, y + 0.2, z, 0.34, 0.06, 0.34, tone(GILT, 0.3), 'brass');
      L.box(x, y + 0.26, z, 0.14, 0.08, 0.14, tone(GILT, 0.7), 'brass');
      glow(x, y, z, 0.22, 0.32, 0.22, GLOW.lantern, 0.9);
      L.box(x, y - 0.18, z, 0.26, 0.05, 0.26, tone(GILT, 0.3), 'brass');
      L.box(x, y - 0.24, z, 0.08, 0.08, 0.08, tone(GILT, 0.6), 'brass');
    }
  }

  // The offerings, facing the door (sacred/offerings.ts); each candle's flame glows at night.
  const props: { make: () => OfferingPiece; x: number; y: number; z: number }[] = [];
  const prop = <K extends OfferingKind>(kind: K, o: OfferingOptionsByKind[K], x: number, y: number, z: number) => {
    props.push({ make: () => offering(kind, o), x, y, z });
    // (a candle's flame: its middle 0.276 m over the candle's foot, at 1:1)
    const k = o.scale ?? 1;
    if (kind === 'candle') glow(x, y + 0.276 * k, z, 0.01 * k, 0.022 * k, 0.01 * k, GLOW.lantern);
  };
  for (const s of [-1, 1]) {
    // Tiered white parasols (chhatr) on each side of him.
    prop('parasol', { height: 2.7 }, X + s * 2.75, TA, 107.2);
    // Tall candles and lotus in vases on the steps, bay sei and fruit.
    prop('candle', { scale: 1.5 }, X + s * 1.25, seat, 109.6);
    prop('candle', { scale: 1.4 }, X + s * 0.35, TC, 108.85);
    prop('lotusVase', {}, X + s * 0.85, TC, 108.85);
    prop('baySei', {}, X + s * 0.42, TB, 108.0);
    prop('candle', { scale: 1.4 }, X + s * 0.3, TA, 107.2);
    prop('lotusVase', {}, X + s * 1.0, TA, 107.2);
    prop('fruitPlate', {}, X + s * 1.6, TA, 107.2);
    prop('candle', { scale: 1.4 }, X + s * 2.1, TA, 107.2);
    // On the offering table: candles, lotus, bay sei at its ends.
    prop('candle', { scale: 1.3 }, X + s * 0.3, tt, 105.45);
    prop('lotusVase', { scale: 0.9 }, X + s * 0.62, tt, 105.4);
    prop('baySei', { tiers: 3 }, X + s * 0.95, tt, 105.4);
  }
  prop('fruitPlate', {}, X, TB, 108.0);
  prop('incense', {}, X, tt, 105.4);
  prop('marigold', { from: [-1.12, 0.47, 0], to: [1.12, 0.47, 0], sag: 0.18 }, X, F, tz0 - 0.04);

  later(() => {
    // The back wall painted with the Bodhi tree and his light; the gilt flame arch behind him; the gold on
    // red; the ivory walls, the ceiling's coffers, the tiled floor.
    sacred.add(muralMesh(2 * IN, CEIL - F, head - F)).position.set(X, F, zBack - 0.01);
    sacred.add(auraMesh(head - seat)).position.set(X, seat, zBack - 0.14);
    sacred.add(friezeMesh(friezes));
    sacred.add(shutterMesh(shutters));
    sacred.add(wallMesh(walls));
    sacred.add(ceilingMesh({ facing: '-y', at: CEIL, a0: X - IN, a1: X + IN, b0: zIn, b1: zBack }));
    sacred.add(floorMesh({ facing: '+y', at: F + 0.004, a0: X - IN, a1: X + IN, b0: zIn, b1: zBack }));
    sacred.add(carpetMesh(carpet));
    sacred.add(matMesh(mats));
    sacred.add(lacquerMesh(tops));
  });
  // (one at a time: the first of each kind is sculpted, the rest share it)
  for (const p of props)
    later(() => {
      const piece = p.make();
      piece.object.position.set(p.x, p.y, p.z);
      piece.object.rotation.y = Math.PI;
      sacred.add(piece.object);
    });
  later(() => {
    // Smaller Buddhas on the steps: calling the earth to witness in saffron cloth, and in meditation.
    const small = (kind: 'shrine' | 'meditate', x: number, y: number, z: number, h: number) => {
      const b = sacred.add(buddhaStatue({ kind, look: 'gilt', height: h, farOnly: true, hide: 90 }));
      b.position.set(x, y, z);
      b.rotation.y = Math.PI;
    };
    for (const s of [-1, 1]) {
      small('shrine', X + s * 1.62, TC, 108.95, 0.78);
      small('meditate', X + s * 0.95, TB, 108.05, 0.66);
      small('shrine', X + s * 2.05, TB, 108.05, 0.66);
    }
    // The candles' light on the statues (finish.ts): before him, on the steps each side, on the table.
    const lamp = (x: number, y: number, z: number, range: number, k: number) => SACRED_LAMPS.push({ x, y, z, range, color: [1.5 * k, 0.85 * k, 0.38 * k], day: 0.35 });
    lamp(X, seat + 1.7, 109.0, 4.5, 1.7);
    lamp(X - 1.6, TC + 0.4, 108.2, 3, 1);
    lamp(X + 1.6, TC + 0.4, 108.2, 3, 1);
    lamp(X, tt + 0.4, 105.2, 2.5, 1);
  });

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
    // The gable ends: over the nave, a painted panel fills the triangle under the upper roof
    // (sacred/gable.ts: gold kbach on red lacquer, a gilt Buddha in high relief in its niche), stepped like the roof and
    // framed in by the gold barge boards, on a gold line; red boards behind it are its back, seen
    // from under the roof. The skirt's ends stay open.
    for (const zg of ends) {
      const out = zg === za ? 1 : -1;
      const zc = zg + out * 0.4;
      const from = upperEave(eave) - 0.35;
      for (let a = -UPPER + 0.25; a < UPPER - 0.2; a += 0.5) {
        const bottom = roofBottom(Math.abs(a) + 0.25, eave);
        if (bottom - from < 0.05) continue;
        L.span(X + a - 0.25, from, zc, X + a + 0.25, bottom, zc + out * 0.2, tone(RED, L.r(a, zg, 20)), 'mapStone');
      }
      L.span(X - UPPER, from - 0.05, zc - 0.2, X + UPPER, from + 0.15, zc + 0.2, tone(GOLD, 0.7), 'brass');
      // The panel's steps: where each row of the roof over it starts, and how high it reaches under that row.
      const edges = [UPPER, SKIRT];
      for (let a = UPPER - RUN; a > 1e-6; a -= RUN) edges.push(a);
      edges.sort((p, q) => q - p);
      const steps = edges.filter((a) => a <= UPPER).map((a) => [a, roofBottom(a - 0.01, eave) - from] as [number, number]);
      // The painted triangle: its slopes through the inner corners of the steps, its foot on the gold line.
      const base = upperEave(eave) - from;
      const inner = UPPER - RUN;
      const spec = { steps, foot: 0.15, half: inner + (base - 0.15) / (RISE / RUN), apex: base + (RISE / RUN) * inner };
      // (the hall's front gable stands behind the porch's roof, its niche out of sight: no Buddha there)
      sacred.add(gable(spec, { x: X, y: from, z: zc - out * 0.15, facing: out > 0 ? -1 : 1 }, zg === Z_STEP ? { buddha: 0 } : {}));
    }
  }

  // ── Two stupas flanking the way up, a Buddhist flag by the stair ──────────
  // Whitewashed chedei with gold bands and a gold spire (sacred/stupa.ts), each on a white plinth, a
  // gilt Buddha in the niche of its base looking down the way up (north), a lamp before him at night.
  // Blocks hidden inside the base make it solid (he walks round it).
  const SH = 5.2;
  const niche = stupaNiche({ height: SH, look: 'white' });
  for (const sx of [X - 9.5, X + 9.5]) {
    const z = 96;
    const y = T.y + 0.4;
    L.span(sx - 1.55, T.y, z - 1.55, sx + 1.55, y, z + 1.55, tone(WHITE, L.r(sx, 21)), 'mapStone');
    L.span(sx - 1.6, y - 0.16, z - 1.6, sx + 1.6, y - 0.08, z + 1.6, tone(YELLOW, 0.3), 'mapStone');
    // (the base is wider than the niche low down, a little wider up to the niche's point; the niche opens north, −z)
    const nw = niche.width;
    const back = niche.at.z - niche.depth / 2 - 0.03;
    L.span(sx - nw * 1.4, y, z - nw * 1.4, sx + nw * 1.4, y + niche.at.y * 0.7, z + nw * 1.4, tone(WHITE, 0.3), 'mapStone');
    L.span(sx - nw * 1.1, y, z - back, sx + nw * 1.1, y + niche.at.y + niche.height, z + nw * 1.1, tone(WHITE, 0.3), 'mapStone');
    glow(sx, y + niche.at.y + 0.04, z - niche.at.z - niche.depth * 0.35, 0.03, 0.05, 0.03, GLOW.lantern, 0.8);
    later(() => {
      const s = sacred.add(stupa({ height: SH, look: 'white', niche: true }));
      s.position.set(sx, y, z);
      s.rotation.y = Math.PI;
      const b = buddhaStatue({ kind: 'meditate', look: 'gilt', height: niche.height * 0.72, farOnly: true, hide: 120 });
      b.position.copy(niche.at);
      s.add(b);
      SACRED_LAMPS.push({ x: sx, y: y + niche.at.y + 0.3, z: z - niche.at.z - niche.depth * 0.6, range: 1.2, color: [1.2, 0.68, 0.3], day: 0 });
    });
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
