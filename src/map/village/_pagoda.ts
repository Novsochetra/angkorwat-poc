import { Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { buddhaStatue } from '../sacred/buddha';
import { SACRED_LAMPS } from '../sacred/finish';
import { gable } from '../sacred/gable';
import { nagaFanReady, roofNaga, stairNaga, type RoofNagaSpec } from '../sacred/naga';
import { offering, type OfferingKind, type OfferingOptionsByKind, type OfferingPiece } from '../sacred/offerings';
import { trackSacred } from '../sacred/pending';
import type { SacredSet } from '../sacred/set';
import { stupa, stupaNiche } from '../sacred/stupa';
import { Local, tone, type GlowFn, type Tones } from './_kit';
import { GLOW } from './_lights';
import { auraMesh, carpetMesh, ceilingMesh, doorPediment, floorMesh, friezeMesh, lacquerMesh, matMesh, muralMesh, shutterMesh, wallMesh, type Face } from './_pagodaArt';
import { GROUND, PAGODA } from './_spots';

/**
 * The village pagoda (វត្ត wat): on a white terrace on the rise south of the
 * village, facing north over the houses to the lake — Khmer, as the wats of
 * Siem Reap (Wat Bo, Wat Preah Prom Rath) and Phnom Penh (Wat Ounalom, the
 * Silver Pagoda), not Thai:
 *
 * - the naga stair: the balustrades are the serpents' smooth stone bodies
 *   on short posts, as on Angkor Wat's causeway; at the stair's foot each
 *   rears up into a fan of seven cobra heads under one smooth hood, a halo
 *   of kbach flame leaves round them (sacred/naga.ts, grey-green stone);
 * - the hall (vihear, វិហារ) on its plinth inside a colonnade of white
 *   pillars with gilt lotus capitals, ochre-yellow walls, red shutters in
 *   gold frames; its roof in two tiers of red-orange terracotta (the eaves'
 *   row deeper red: no green edge, which reads Thai), the porch's part
 *   stepped lower; along every gable's slopes a gilt barge board, the
 *   naga's body, ending at each eave in a five-headed naga hood; on each
 *   ridge's end a slender hooked chovea (ជហ្វា: sacred/naga.ts); a gold line
 *   along the ridge;
 * - the gables: gold kbach on red lacquer round Brahma's four faces under
 *   a broad tiered crown (the Bayon's faces; sacred/gable.ts, kbach.ts); over
 *   the door, a gilt pediment with Reahu swallowing the moon (_pagodaArt.ts);
 * - round the hall the eight seima (សីមា) boundary stones, leaf-shaped,
 *   each in a little shrine with a tiered roof (the front one a pair either
 *   side of the way in); two stupas by the way up (sacred/stupa.ts); the
 *   crocodile flag (ទង់ក្រពើ, the multicoloured festive one) on a tall pole
 *   with a golden hamsa at its top; a drum pavilion (the skor, a barrel
 *   drum on its cradle) and a bell pavilion, each under a small tiered
 *   roof with a lotus-bud spire.
 *
 * Inside (a vihear, preah vihear): the gilt Buddha calling the earth to
 * witness high on a tiered red and gold altar under a flame arch, the
 * Bodhi tree painted on the wall behind him, smaller Buddhas, parasols,
 * candles and offerings on the steps, mats and a red carpet before them
 * (the painted surfaces: _pagodaArt.ts).
 *
 * World metres; the hall's axis runs north–south at `PAGODA.x`. The
 * sculpted and painted pieces are made just after the build (in `later`);
 * the console line `[map] village pagoda: …` gives its blocks.
 */

const WHITE: Tones = [0xf0e9da, 0xe9e1cf, 0xf4eee2, 0xe4dccb];
const TERRACE: Tones = [0xd6cfc0, 0xcdc5b4, 0xdcd5c6, 0xc6bdab];
/** The hall's walls: the warm yellow of a Cambodian pagoda. */
const OCHRE: Tones = [0xe3bb66, 0xdcb25e, 0xe8c272, 0xd6ab57];
const YELLOW: Tones = [0xe2b85a, 0xd9ad4e];
/** Roof tiles: red-orange terracotta; the eaves' row a deeper red. */
const TILE: Tones = [0xc8582a, 0xbf5026, 0xd0632f, 0xb84a24, 0xc55c2c];
const TILE_EDGE: Tones = [0x9a3a22, 0xa3402a, 0x8f341e];
const RED: Tones = [0x9c2e24, 0xa8342a, 0x922a22];
const GOLD: Tones = [0xd9a93a, 0xe6b84a, 0xcc9a32];
/** Grey-green sandstone: the stair's naga posts, the seima stones. */
const STONE: Tones = [0x9ea48c, 0x959b83, 0xa7ac95, 0x8f957e];

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

/**
 * The line through the outer top corners of a roof tier's stepped rows
 * (its gable's slope), a little over them (m): for a tier from ±`from` (its
 * eaves at `y0`), at |x − axis| = `a`.
 */
const slopeAt = (from: number, y0: number, a: number) => y0 + RISE + 0.1 + (from - a) * (RISE / RUN);

export interface PagodaOut {
  /** Where the explorer kneels (on the porch, before the door) and what he faces (the Buddha through the door). */
  worship: { x: number; y: number; z: number; fx: number; fz: number };
}

/** `sacred` takes the sculpted pieces (the Buddha, the gables' carvings, the naga), in world metres. */
export function buildPagoda(field: HeightField, world: VoxelBuilder, glow: GlowFn, sacred: SacredSet): PagodaOut {
  const src = traceSource();
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 3301);
  const X = PAGODA.x;
  const T = PAGODA.terrace;
  const F = PAGODA.floor;
  const g = (x: number, z: number) => field.heightAt(x, z);
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

  // The sculpted and painted pieces are made just after the build (sculpting and painting take a few hundred
  // ms, off the part's build time); shots wait for them (sacred/pending.ts).
  const later = (make: () => void | Promise<void>) =>
    void trackSacred(
      new Promise<void>((done) =>
        setTimeout(async () => {
          try {
            await make();
          } finally {
            done();
          }
        }, 0),
      ),
    );

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

  // ── The naga stair: six steps between two balustrades, as Angkor Wat's causeway ──
  // White cheek walls with a stone coping step down with the stair; on them short stone posts carry the
  // naga's smooth body (sacred, made later), which runs on a little onto the terrace and ends there in its
  // tail curling up; at the stair's foot the body bends down and rears up again into the fan of heads, on a
  // white pedestal.
  const steps = Math.round((T.y - GROUND) / 0.5);
  const run = (S.z1 - S.z0) / steps;
  const NAGA_R = 0.26;
  /** The middle of the naga's body over the stair at z (m). */
  const railY = (z: number) => GROUND + (0.5 / run) * (z - S.z0) + 1.3;
  const cheeks: [number, number][] = [
    [S.x0 - 1, S.x0],
    [S.x1, S.x1 + 1],
  ];
  for (let i = 0; i < steps; i++) {
    const z = S.z0 + i * run;
    const top = GROUND + (i + 1) * 0.5;
    L.span(S.x0, Math.min(g(S.x0, z), g(S.x1, z)) - 0.3, z, S.x1, top, z + run, tone(TERRACE, L.r(i, 4)), 'mapStone', 0.96);
    for (const [c0, c1] of cheeks) {
      L.span(c0, g(c0 + 0.5, z) - 0.3, z, c1, top + 0.3, z + run, tone(WHITE, L.r(i, c0, 5)), 'mapStone');
      L.span(c0 - 0.04, top + 0.3, z, c1 + 0.04, top + 0.38, z + run, tone(TERRACE, L.r(i, c0, 6)), 'mapStone', 1.04);
      // (a post under the body at each step but the lowest, where the body bends down to the fan)
      if (i === 0) continue;
      const cx = (c0 + c1) / 2;
      const zm = z + run / 2;
      L.span(cx - 0.14, top + 0.38, zm - 0.14, cx + 0.14, railY(zm) - NAGA_R * 0.7, zm + 0.14, tone(STONE, L.r(i, c0, 7)), 'mapStone');
      L.span(cx - 0.18, top + 0.38, zm - 0.18, cx + 0.18, top + 0.46, zm + 0.18, tone(STONE, L.r(c0, i, 8)), 'mapStone', 0.95);
    }
  }
  // (the balustrades run on onto the terrace, a post under the body where its tail rises)
  const zTop = S.z1;
  for (const [c0, c1] of cheeks) {
    const cx = (c0 + c1) / 2;
    L.span(c0, T.y, zTop, c1, T.y + 0.3, zTop + 0.8, tone(WHITE, L.r(c0, 9)), 'mapStone');
    L.span(c0 - 0.04, T.y + 0.3, zTop, c1 + 0.04, T.y + 0.38, zTop + 0.8, tone(TERRACE, L.r(c0, 10)), 'mapStone', 1.04);
    L.span(cx - 0.14, T.y + 0.38, zTop + 0.26, cx + 0.14, railY(zTop) - NAGA_R * 0.7, zTop + 0.54, tone(STONE, L.r(c0, 11)), 'mapStone');
  }
  // The pedestals at the foot, the fans on them looking north down the way.
  const fanY = GROUND + 0.98;
  const fanZ = S.z0 - 0.6;
  for (const cx of [S.x0 - 0.5, S.x1 + 0.5]) {
    L.span(cx - 0.62, g(cx, fanZ) - 0.3, fanZ - 0.62, cx + 0.62, GROUND + 0.9, fanZ + 0.62, tone(WHITE, 0.4), 'mapStone');
    L.span(cx - 0.68, GROUND + 0.9, fanZ - 0.68, cx + 0.68, fanY, fanZ + 0.68, tone(TERRACE, 0.5), 'mapStone', 1.04);
    L.span(cx - 0.66, GROUND + 0.12, fanZ - 0.66, cx + 0.66, GROUND + 0.22, fanZ + 0.66, tone(YELLOW, 0.5), 'mapStone');
    // (a lamp at the pedestal's foot, lit at night)
    glow(cx, GROUND + 0.4, fanZ - 0.7, 0.14, 0.2, 0.06, GLOW.lantern, 0.9);
  }
  // (the fans are sculpted in a worker: sacred/naga.ts `nagaFanReady`)
  later(async () => {
    await Promise.all([nagaFanReady('stair'), nagaFanReady('stairFar')]);
    const fans = [S.x0 - 0.5, S.x1 + 0.5].map((cx) => ({ at: V(cx, fanY, fanZ), look: V(0, 0, -1), height: 2.75 }));
    const top = railY(S.z1);
    const bodies = [S.x0 - 0.5, S.x1 + 0.5].map((cx) => ({
      path: [V(cx, fanY + 0.24, fanZ + 0.6), V(cx, fanY + 0.42, fanZ + 1.15), V(cx, railY(S.z0 + 1.5), S.z0 + 1.5), V(cx, railY(S.z1 - 0.4), S.z1 - 0.4), V(cx, top + 0.02, S.z1 + 0.12), V(cx, top + 0.1, S.z1 + 0.42), V(cx, top + 0.32, S.z1 + 0.64), V(cx, top + 0.55, S.z1 + 0.6), V(cx, top + 0.62, S.z1 + 0.44)],
      tail: 0.9,
    }));
    sacred.add(stairNaga({ fans, bodies, radius: NAGA_R, look: 'stone' }));
  });

  // ── The hall's plinth and front steps ─────────────────────────────────────
  const px0 = X - 6;
  const px1 = X + 6;
  const pz0 = 94.5;
  const pz1 = 114;
  for (let z = pz0; z < pz1 - 0.01; z += 2)
    for (let x = px0; x < px1 - 0.01; x += 2) L.span(x, T.y - 0.1, z, x + 2, F, Math.min(pz1, z + 2), tone(WHITE, L.r(x, z, 8)), 'mapStone', 0.97);
  L.span(px0 - 0.05, T.y + 0.15, pz0 - 0.05, px1 + 0.05, T.y + 0.4, pz1 + 0.05, tone(YELLOW, 0.2), 'mapStone');
  L.span(X - 2, T.y, pz0 - 1, X + 2, T.y + 0.5, pz0, tone(TERRACE, 0.5), 'mapStone');

  // ── The colonnade: white pillars on lotus bases, gilt lotus capitals ─────
  const eaveAt = (z: number) => (z < Z_STEP ? EAVE_Y - PORCH_DROP : EAVE_Y);
  const pillar = (x: number, z: number, beam: number) => {
    const top = beam - 0.35;
    L.span(x - 0.34, F, z - 0.34, x + 0.34, F + 0.2, z + 0.34, tone(WHITE, L.r(x, z, 9)), 'mapStone', 0.97);
    L.span(x - 0.3, F + 0.2, z - 0.3, x + 0.3, F + 0.36, z + 0.3, tone(GOLD, L.r(z, x, 9)), 'brass');
    L.span(x - 0.25, F + 0.36, z - 0.25, x + 0.25, top - 0.42, z + 0.25, tone(WHITE, L.r(x, z, 10)), 'mapStone');
    L.span(x - 0.29, top - 0.42, z - 0.29, x + 0.29, top - 0.3, z + 0.29, tone(GOLD, L.r(x, z, 11)), 'brass');
    L.span(x - 0.37, top - 0.3, z - 0.37, x + 0.37, top, z + 0.37, tone(GOLD, L.r(z, x, 12)), 'brass');
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

  // ── The hall: ochre walls up under the roof, tall windows with red shutters, the open door ──
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
    for (const [a, b] of segs) L.span(x - 0.2, F, a, x + 0.2, wallTop, b, tone(OCHRE, L.r(a, s, 11)), 'mapStone');
    for (const wz of winZ) {
      L.span(x - 0.2, F, wz - 0.55, x + 0.2, F + 1.4, wz + 0.55, tone(OCHRE, L.r(wz, s, 12)), 'mapStone');
      L.span(x - 0.2, F + 3.4, wz - 0.55, x + 0.2, wallTop, wz + 0.55, tone(OCHRE, L.r(wz, s, 13)), 'mapStone');
      glow(x, F + 2.4, wz, 0.2, 2.0, 1.1, GLOW.hall);
      // Gold frame, red shutters opened out.
      L.span(x + s * 0.2, F + 1.3, wz - 0.65, x + s * 0.3, F + 1.45, wz + 0.65, tone(GOLD, 0.5), 'brass');
      L.span(x + s * 0.2, F + 3.35, wz - 0.65, x + s * 0.3, F + 3.6, wz + 0.65, tone(GOLD, 0.5), 'brass');
      for (const d of [-1, 1]) L.span(x + s * 0.22, F + 1.45, wz + d * 0.6, x + s * 0.3, F + 3.35, wz + d * 1.15, tone(RED, L.r(wz, d, 14)), 'mapStone');
    }
    L.span(x - 0.25, F, Z0, x + 0.25, F + 0.35, HALL_BACK, tone(WHITE, 0.4), 'mapStone');
  }
  // Front wall: the door (2 m by 3 m) in a gold frame, its red leaves open, the gilt pediment over it; back wall plain.
  const front = (a: number, b: number, y0: number, y1: number) => L.span(a, y0, Z0 - 0.2, b, y1, Z0 + 0.2, tone(OCHRE, L.r(a, y0, 15)), 'mapStone');
  front(X - HALL, X - 1, F, wallTop);
  front(X + 1, X + HALL, F, wallTop);
  front(X - 1, X + 1, F + 3, wallTop);
  for (const s of [-1, 1]) L.span(Math.min(X + s * 1.2, X + s * HALL), F, Z0 - 0.25, Math.max(X + s * 1.2, X + s * HALL), F + 0.35, Z0 + 0.25, tone(WHITE, 0.4), 'mapStone');
  L.span(X - 1.2, F, Z0 - 0.3, X - 1.0, F + 3.2, Z0 - 0.2, tone(GOLD, 0.2), 'brass');
  L.span(X + 1.0, F, Z0 - 0.3, X + 1.2, F + 3.2, Z0 - 0.2, tone(GOLD, 0.2), 'brass');
  L.span(X - 1.2, F + 3.0, Z0 - 0.3, X + 1.2, F + 3.25, Z0 - 0.2, tone(GOLD, 0.2), 'brass');
  for (const s of [-1, 1]) L.span(X + s * 1.05, F, Z0 - 1.0, X + s * 1.15, F + 2.95, Z0 - 0.3, tone(RED, 0.5), 'mapStone');
  L.span(X - HALL, F, HALL_BACK - 0.2, X + HALL, wallTop, HALL_BACK + 0.2, tone(OCHRE, 0.6), 'mapStone');

  // ── Inside: a golden Buddha on a red altar at the back, candles before him ──
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
    // Over the door outside: the gilt pediment, Reahu swallowing the moon in a frame of flames.
    sacred.add(doorPediment()).position.set(X, F + 3.27, Z0 - 0.215);
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
  // Rows of red-orange tiles, the eaves' row deeper red, a gold line along the ridge. The gilt naga (barge
  // boards over the rows' stepped ends, their five-headed hoods at the eaves, the chovea) are sculpted later.
  // (za, zb, eaves, the ends that show: the porch's back end is under the hall's roof)
  const sections: [number, number, number, number[]][] = [
    [Z_FRONT, Z_STEP, EAVE_Y - PORCH_DROP, [Z_FRONT]],
    [Z_STEP, Z_BACK, EAVE_Y, [Z_STEP, Z_BACK]],
  ];
  const naga: RoofNagaSpec = { rakes: [], fans: [], choveas: [] };
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
        const color = (z: number) => (k === 0 ? tone(TILE_EDGE, L.r(z, k, 16)) : tone(TILE, L.r(z, k + y0, 17)));
        for (const s of [-1, 1]) {
          if (ridge && s > 0) break;
          const xa = ridge ? X - outer : s < 0 ? X - outer : X + inner;
          const xb = ridge ? X + outer : s < 0 ? X - inner : X + outer;
          for (let z = za, i = 0; z < zb - 0.05; i++) {
            const e = Math.min(zb, z + 1.4 + L.r(i, k, 18) * 1.2);
            L.span(xa, y, z, xb, y + RISE + 0.05, e, color(z + i), 'mapStone', k % 3 === 2 ? 0.92 : 1);
            z = e;
          }
        }
        if (ridge) {
          const top = y + RISE + 0.05;
          L.span(X - 0.14, top, za + 0.05, X + 0.14, top + 0.12, zb - 0.05, tone(GOLD, 0.4), 'brass');
        }
      }
      // The naga at each gable end: a barge board down each slope (the skirt's tucked in under the upper
      // roof), a fan of heads at each eave, the chovea on the ridge's end.
      for (const zg of ends) {
        const out = zg === za ? -1 : 1;
        const zo = zg + out * 0.02;
        const aTop = to === 0 ? 0 : 5.05;
        for (const s of [-1, 1]) {
          naga.rakes.push({ from: V(X + s * (from + 0.04), slopeAt(from, y0, from + 0.04), zo), to: V(X + s * aTop, slopeAt(from, y0, aTop), zo), out: V(0, 0, out) });
          naga.fans.push({ at: V(X + s * (from + 0.18), y0 + 0.12, zg + out * 0.12), look: V(s, 0, out * 0.95).normalize(), height: 1.1 });
        }
        if (to === 0) naga.choveas.push({ at: V(X, slopeAt(from, y0, 0) - 0.06, zg + out * 0.08), out: V(0, 0, out), height: eave === EAVE_Y ? 1.75 : 1.5 });
      }
    }
    // The gable ends: over the nave, a painted panel fills the triangle under the upper roof
    // (sacred/gable.ts: gold kbach on red lacquer round Brahma's four faces), stepped like the roof and
    // framed by the barge boards, on a gold line; red boards behind it are its back, seen from under the
    // roof. The skirt's ends stay open.
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
      // (the hall's front gable stands behind the porch's roof: only its top shows)
      sacred.add(gable(spec, { x: X, y: from, z: zc - out * 0.15, facing: out > 0 ? -1 : 1 }, { figure: 'brahma' }));
    }
  }
  later(async () => {
    await nagaFanReady('roof');
    sacred.add(roofNaga(naga));
  });

  // ── Two stupas flanking the way up ────────────────────────────────────────
  // Khmer chedei (sacred/stupa.ts), each on a white plinth, a gilt Buddha in the niche of its base looking
  // down the way up (north), a lamp before him at night. Blocks hidden inside the base make it solid.
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
      const s = sacred.add(stupa({ height: SH, look: 'white', niche: true, form: 'faces' }));
      s.position.set(sx, y, z);
      s.rotation.y = Math.PI;
      const b = buddhaStatue({ kind: 'meditate', look: 'gilt', height: niche.height * 0.72, farOnly: true, hide: 120 });
      b.position.copy(niche.at);
      s.add(b);
      SACRED_LAMPS.push({ x: sx, y: y + niche.at.y + 0.3, z: z - niche.at.z - niche.depth * 0.6, range: 1.2, color: [1.2, 0.68, 0.3], day: 0 });
    });
  }

  // ── The eight seima round the hall ────────────────────────────────────────
  // At its corners and the middles of its sides (the front one a pair, either side of the way in), each a
  // leaf-shaped stone on a lotus base in a little shrine: a white plinth, four slender posts, a two-tier
  // roof of tiles with a gold lotus bud. Their broad faces look out from the hall.
  const seimaAt: [number, number, 'x' | 'z'][] = [
    [-3.0, 93.45, 'z'],
    [3.0, 93.45, 'z'],
    [-7.1, 93.45, 'z'],
    [7.1, 93.45, 'z'],
    [-7.1, 104.25, 'x'],
    [7.1, 104.25, 'x'],
    [-7.1, 114.9, 'z'],
    [7.1, 114.9, 'z'],
    [0, 114.9, 'z'],
  ];
  for (const [a, z, face] of seimaAt) seima(L, X + a, T.y, z, face);

  // ── The crocodile flag on its tall pole, a golden hamsa on top ────────────
  crocodileFlag(L, S.x1 + 2.6, g(S.x1 + 2.6, S.z0 - 0.5), S.z0 - 0.5);

  // ── A bell pavilion and a drum pavilion at the terrace's back corners ────
  for (const [px, drum] of [
    [T.x1 - 2.6, false],
    [T.x0 + 2.6, true],
  ] as [number, boolean][])
    pavilion(L, px, T.y, T.z1 - 3, drum);

  console.info(`[map] village pagoda: ${lb.boxes.length} blocks (the naga, gables, Buddhas and offerings sculpted after the build)`);
  world.append(lb);

  // He kneels on the porch before the open door, facing the Buddha inside.
  return { worship: { x: X, y: F, z: Z0 - 2.2, fx: X, fz: bz } };
}

/**
 * A seima (សីមា) at (x, y, z) on the terrace: a leaf-shaped stone of grey-green
 * sandstone on a lotus base, its broad face across `face` (it looks along
 * the other level axis), in a little shrine — a white plinth with a gold
 * coping, four slender white posts, a two-tier roof of tiles, a gold
 * lotus bud.
 */
function seima(L: Local, x: number, y: number, z: number, face: 'x' | 'z'): void {
  const r = (k: number) => L.r(x, z, k);
  L.span(x - 0.42, y, z - 0.42, x + 0.42, y + 0.3, z + 0.42, tone(WHITE, r(40)), 'mapStone');
  L.span(x - 0.45, y + 0.3, z - 0.45, x + 0.45, y + 0.36, z + 0.45, tone(GOLD, r(41)), 'brass');
  // The lotus base (gold petals over a white cushion) and the stone: rows narrowing to a point.
  const along = (w: number, d: number, y0: number, y1: number, c: number, mat: 'mapStone' | 'brass') => (face === 'z' ? L.span(x - w, y0, z - d, x + w, y1, z + d, c, mat) : L.span(x - d, y0, z - w, x + d, y1, z + w, c, mat));
  along(0.26, 0.15, y + 0.36, y + 0.44, tone(GOLD, r(42)), 'brass');
  along(0.22, 0.12, y + 0.44, y + 0.5, tone(WHITE, r(43)), 'mapStone');
  const stone = tone(STONE, r(44));
  let sy = y + 0.5;
  for (const [w, h] of [
    [0.2, 0.28],
    [0.18, 0.16],
    [0.14, 0.12],
    [0.09, 0.09],
    [0.04, 0.08],
  ]) {
    along(w, 0.06, sy, sy + h, stone, 'mapStone');
    sy += h;
  }
  // (a ridge down its middle)
  along(0.025, 0.075, y + 0.52, y + 1.05, tone(STONE, r(45)), 'mapStone');
  // The shrine: posts, the two-tier roof, the bud.
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    L.span(x + dx * 0.36 - 0.035, y + 0.36, z + dz * 0.36 - 0.035, x + dx * 0.36 + 0.035, y + 1.55, z + dz * 0.36 + 0.035, tone(WHITE, r(46)), 'mapStone');
  L.span(x - 0.5, y + 1.55, z - 0.5, x + 0.5, y + 1.66, z + 0.5, tone(TILE_EDGE, r(47)), 'mapStone');
  L.span(x - 0.38, y + 1.66, z - 0.38, x + 0.38, y + 1.8, z + 0.38, tone(TILE, r(48)), 'mapStone');
  L.span(x - 0.24, y + 1.8, z - 0.24, x + 0.24, y + 1.93, z + 0.24, tone(TILE, r(49)), 'mapStone');
  L.span(x - 0.08, y + 1.93, z - 0.08, x + 0.08, y + 2.1, z + 0.08, tone(GOLD, r(50)), 'brass');
  L.span(x - 0.035, y + 2.1, z - 0.035, x + 0.035, y + 2.24, z + 0.035, tone(GOLD, r(51)), 'brass');
}

/**
 * The crocodile flag (ទង់ក្រពើ) on its pole at (x, y, z) on the ground: a
 * tall pole on a white plinth, a golden hamsa (the swan, Brahma's mount) on
 * its top over a short crossbar, and hanging from the bar the long flag cut
 * in a crocodile's shape — its head up, four legs, a long tapering tail —
 * stiffened by bamboo rods across it, in bands of festive colours (the
 * white one is for funerals).
 */
function crocodileFlag(L: Local, x: number, y: number, z: number): void {
  const H = 11;
  L.span(x - 0.45, y - 0.2, z - 0.45, x + 0.45, y + 0.3, z + 0.45, tone(WHITE, 0.3), 'mapStone');
  L.span(x - 0.3, y + 0.3, z - 0.3, x + 0.3, y + 0.5, z + 0.3, tone(WHITE, 0.6), 'mapStone');
  L.span(x - 0.08, y + 0.5, z - 0.08, x + 0.08, y + H, z + 0.08, 0x8a5a36, 'mapBark');
  for (const t of [0.25, 0.5, 0.75]) L.span(x - 0.1, y + H * t, z - 0.1, x + 0.1, y + H * t + 0.12, z + 0.1, tone(GOLD, t), 'brass');
  // The hamsa: a gold bird standing on the pole's top, looking east, its tail up behind.
  const hy = y + H;
  L.box(x, hy + 0.06, z, 0.22, 0.12, 0.22, tone(GOLD, 0.2), 'brass');
  L.box(x, hy + 0.24, z, 0.42, 0.2, 0.2, tone(GOLD, 0.5), 'brass');
  L.box(x + 0.2, hy + 0.44, z, 0.08, 0.3, 0.08, tone(GOLD, 0.7), 'brass');
  L.box(x + 0.26, hy + 0.6, z, 0.16, 0.1, 0.1, tone(GOLD, 0.9), 'brass');
  L.box(x - 0.24, hy + 0.36, z, 0.12, 0.2, 0.16, tone(GOLD, 0.3), 'brass');
  // The crossbar, and the flag hanging from its end (in the plane x–y, facing north and south).
  const bx = x + 0.55;
  L.span(x, hy - 0.52, z - 0.03, bx + 0.12, hy - 0.46, z + 0.03, 0x6a4a30, 'mapBark');
  const top = hy - 0.55;
  // (the cloth hangs in soft folds: each band a little forward or back of the last)
  let fold = 0;
  const cloth = (cx: number, w: number, y0: number, y1: number, c: number) => {
    const dz = 0.035 * Math.sin(fold++ * 1.9);
    L.span(cx - w / 2, y0, z + dz - 0.015, cx + w / 2, y1, z + dz + 0.015, c, 'petal');
  };
  const BANDS = [0xc8302a, 0xf0c030, 0x2f6ab8, 0x3a9a5a, 0xe8801a, 0x8a3a8c];
  // The head: the snout up (at the bar), widening to the neck; two eyes.
  const head: [number, number][] = [
    [0.16, 0.25],
    [0.3, 0.3],
    [0.46, 0.35],
  ];
  let fy = top;
  for (const [w, h] of head) {
    cloth(bx, w, fy - h, fy, 0xc8302a);
    fy -= h;
  }
  cloth(bx - 0.1, 0.07, fy + 0.18, fy + 0.26, 0xf2eee6);
  cloth(bx + 0.1, 0.07, fy + 0.18, fy + 0.26, 0xf2eee6);
  // The body: bands between the rods, a leg out each side at the shoulders and the hips.
  const bodyTop = fy;
  for (let i = 0; i < 6; i++) {
    const y1 = bodyTop - i * 0.42;
    cloth(bx, 0.66, y1 - 0.42, y1, BANDS[i % BANDS.length]);
    L.span(bx - 0.42, y1 - 0.03, z - 0.03, bx + 0.42, y1 + 0.02, z + 0.03, 0xd8c08a, 'mapBark');
  }
  for (const ly of [bodyTop - 0.5, bodyTop - 2.0])
    for (const s of [-1, 1]) {
      cloth(bx + s * 0.5, 0.26, ly - 0.16, ly, 0x3a9a5a);
      cloth(bx + s * 0.6, 0.12, ly - 0.36, ly - 0.14, 0x3a9a5a);
    }
  // The tail, tapering down in bands.
  fy = bodyTop - 6 * 0.42;
  let w = 0.52;
  for (let i = 0; i < 6; i++) {
    cloth(bx, w, fy - 0.4, fy, BANDS[(i + 3) % BANDS.length]);
    fy -= 0.4;
    w *= 0.74;
  }
}

/**
 * A pavilion at the terrace's back corner (its middle at (px, y, pz)): four
 * white posts on a gold beam frame, a Khmer two-tier roof of tiles with
 * gold corners and a lotus-bud spire; under it the bronze bell with its log
 * striker, or (`drum`) the skor: a big barrel drum on its side on a wooden
 * cradle, its skins to the east and west.
 */
function pavilion(L: Local, px: number, y: number, pz: number, drum: boolean): void {
  for (const [dx, dz] of [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ]) {
    L.span(px + dx - 0.18, y, pz + dz - 0.18, px + dx + 0.18, y + 0.2, pz + dz + 0.18, tone(WHITE, 0.2), 'mapStone');
    L.span(px + dx - 0.13, y + 0.2, pz + dz - 0.13, px + dx + 0.13, y + 3.2, pz + dz + 0.13, tone(WHITE, L.r(dx, dz, 24)), 'mapStone');
  }
  L.span(px - 1.4, y + 3.05, pz - 1.4, px + 1.4, y + 3.3, pz + 1.4, tone(GOLD, 0.5), 'brass');
  // The roof: the lower tier stepping in twice, the upper three times, the corners turned up in gold, the bud.
  const rows: [number, number, Tones][] = [
    [1.85, 0.2, TILE_EDGE],
    [1.55, 0.24, TILE],
    [1.2, 0.2, TILE_EDGE],
    [0.95, 0.24, TILE],
    [0.66, 0.24, TILE],
    [0.38, 0.22, TILE],
  ];
  let ry = y + 3.3;
  rows.forEach(([hw, h, tones], k) => {
    L.span(px - hw, ry, pz - hw, px + hw, ry + h, pz + hw, tone(tones, L.r(k, px, 25)), 'mapStone', k % 2 ? 0.96 : 1);
    ry += h;
  });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    L.box(px + dx * 1.8, y + 3.55, pz + dz * 1.8, 0.14, 0.34, 0.14, tone(GOLD, 0.4), 'brass');
    L.box(px + dx * 1.16, y + 4.0, pz + dz * 1.16, 0.12, 0.3, 0.12, tone(GOLD, 0.6), 'brass');
  }
  L.box(px, ry + 0.15, pz, 0.3, 0.3, 0.3, tone(GOLD, 0.2), 'brass');
  L.box(px, ry + 0.45, pz, 0.2, 0.3, 0.2, tone(GOLD, 0.5), 'brass');
  L.box(px, ry + 0.72, pz, 0.1, 0.26, 0.1, tone(GOLD, 0.8), 'brass');
  if (drum) {
    // The skor thom on its cradle: the barrel dark red with brass tacks round each skin.
    for (const s of [-1, 1]) {
      L.span(px + s * 0.55 - 0.08, y, pz - 0.5, px + s * 0.55 + 0.08, y + 0.75, pz - 0.36, 0x6a4a30, 'mapBark');
      L.span(px + s * 0.55 - 0.08, y, pz + 0.36, px + s * 0.55 + 0.08, y + 0.75, pz + 0.5, 0x6a4a30, 'mapBark');
      L.span(px + s * 0.55 - 0.08, y + 0.6, pz - 0.5, px + s * 0.55 + 0.08, y + 0.72, pz + 0.5, 0x6a4a30, 'mapBark');
    }
    L.span(px - 0.72, y + 0.72, pz - 0.5, px + 0.72, y + 1.72, pz + 0.5, 0x7a2e20, 'mapBark');
    L.span(px - 0.62, y + 0.66, pz - 0.56, px + 0.62, y + 1.78, pz + 0.56, 0x8a3424, 'mapBark');
    for (const s of [-1, 1]) {
      L.span(px + s * 0.72 - 0.04, y + 0.8, pz - 0.42, px + s * 0.72 + 0.04, y + 1.64, pz + 0.42, 0xe0cfa8, 'mapStone');
      L.span(px + s * 0.68 - 0.03, y + 0.76, pz - 0.47, px + s * 0.68 + 0.03, y + 1.68, pz + 0.47, tone(GOLD, 0.5), 'brass');
    }
  } else {
    // The bronze bell hung from a beam, a log striker on ropes beside it.
    L.span(px - 1.1, y + 2.9, pz - 0.08, px + 1.1, y + 3.05, pz + 0.08, tone(RED, 0.2), 'mapStone');
    L.box(px, y + 2.72, pz, 0.08, 0.3, 0.08, 0x6a5a3a, 'metal');
    const bell: [number, number][] = [
      [0.3, 0.14],
      [0.42, 0.18],
      [0.52, 0.22],
      [0.62, 0.16],
      [0.7, 0.08],
    ];
    let by = y + 2.58;
    for (const [w, h] of bell) {
      L.box(px, by - h / 2, pz, w, h, w, 0xa8823a, 'brass');
      by -= h;
    }
    for (const dz of [-0.35, 0.35]) L.box(px + 0.75, y + 2.35, pz + dz, 0.03, 1.1, 0.03, 0xc8b88a, 'petal');
    L.span(px + 0.62, y + 1.72, pz - 0.5, px + 0.88, y + 1.94, pz + 0.5, 0x6a4a30, 'mapBark');
  }
}
