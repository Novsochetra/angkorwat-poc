import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { bananaPlant } from '../veg/banana';
import { plantDetail } from '../veg/detail';
import { beam, type P3 } from '../veg/plantKit';
import { RAMPS, type Proto } from '../veg/proto';
import { broadleaf, bush } from '../veg/species';
import { GATE, onSquare, SQUARE, STAGE } from './plan';
import { LATERITE, PAVER, pick } from './_sqKit';
import { SALA } from './_sqSala';
import { ARCH, AVENUE, onAvenue } from './_sqWalk';

/**
 * The festival square's surroundings (AWP-35; the owner's overhead reference: the square sits in a lush garden, no
 * bare field round it). Built after everything else of the square's (the garden, the sala, the stalls, the lantern
 * walk, the avenue and its flags), so it keeps off all of it (`field.occupied`, the trails' treads, water), and
 * before the string-light poles (`_sqGlow.ts`), which it leaves room for: nothing solid within 1.32 of the square's
 * ellipse nor 9.5 m of the avenue's middle where their pole pairs stand.
 *
 * In a band from the square's edge out to ≈ 35 m, and both sides of the avenue down to the welcome arch, dense near
 * the square and the avenue, thinning outward, in drifts (seeded value noise), never in rows:
 *
 * - **ground cover**: low patches of darker moss, young green and dry straw-green over the land's grass, so the
 *   meadow is not one flat colour;
 * - **tall grass** in clumps of thin blades (straw-green to gold at the tips), **reeds** with brown cattail heads by
 *   the Kulen stream and wet ground;
 * - **flowering shrubs**: bougainvillea (magenta and purple bracts, sprawling), hibiscus (ផ្កាជបា: upright, red and
 *   pink flowers), ixora (ផ្កាកន្ទុំ, red jungle geranium: low and round, red-orange clusters) and plain green bushes;
 * - **low flowers** in small patches: marigold (ផ្កាដាវរឿង) orange and yellow, periwinkle pink and white;
 * - **banana plants** in small clumps (the map's own, `veg/banana.ts`; lite on low);
 * - **trees** in the far band: the map's own broadleaf (`veg/species.ts`), some in pink or purple blossom; none
 *   between the gate and the stage, none on the avenue's line of sight, none behind the stage (the hill's jungle is
 *   there, and the crowd looks over it at the show);
 * - **stepping stones**: from the sala south to the back trail, and from the gate's forecourt east over the picnic
 *   trail to the stream's ghat (in the floor's builder: kept out of the walk map, no shadow).
 *
 * Everything goes into the square's builders and families (leaf, petal, bark, stone): no draw of its own. Plants
 * are soft (the walk map's `SOFT`: leaf and petal), so the trails stay walkable; trunks, banana stems and the
 * bushes' ground are `occupied` so the vegetation part's trees keep off. Static (the part is FROZEN).
 *
 * Blocks: ≈ 7–8 k on medium, ≈ 3.5–4 k on low (fewer of everything, single-blade clumps thinner, lite bananas).
 */
export interface MeadowOut {
  blocks: number;
  ms: number;
}

/** How far out the band reaches past the square's edge (m). */
const BAND = 35;
/** The avenue's band: full density to `near` m from its middle, none past `far`. */
const AV_NEAR = 12;
const AV_FAR = 26;

const MOSS = [0x4f8028, 0x5e8f2c, 0x6a9a30, 0x47762a, 0x86a63a, 0x93a842, 0x749f34];
const GRASS = [0x6f8a30, 0x7d9636, 0x8ea33e, 0x9aa848, 0x657f2c, 0xa8a850];
const GRASS_TIP = [0xb8b25a, 0xc4b864, 0xa8a24a];
const REED = [0x3f6a2e, 0x4c7a34, 0x5a8a3a, 0x466e2e];
const CATTAIL = [0x5a3a22, 0x6a4428, 0x4e3220];
const SHRUB_LEAF = [0x22422a, 0x2c5230, 0x376236, 0x447238, 0x527e3a];
const GREEN_BUSH = [0x1f3a28, 0x2a4c30, 0x365c34, 0x456c36, 0x5a8038];
const BOUG = [0xc0186e, 0xd42a80, 0xe2449a, 0xb01062, 0xe85aa8];
const BOUG_PURPLE = [0x8a2aa8, 0x9a3ab8, 0xa84cc4, 0x7a2496];
const HIBISCUS = [0xd8202e, 0xe23a3a, 0xc81a2a, 0xf06a8a, 0xe84a6a];
const IXORA = [0xe8402a, 0xf05a2a, 0xd8302a, 0xf27030];
const MARIGOLD = [0xf08a12, 0xf7a81c, 0xe8740e, 0xf7c030];
const PERIWINKLE = [0xf07aa8, 0xe8609a, 0xfdf4f6, 0xf596bd];
const FLOWER_LEAF = [0x3f7a2e, 0x4a8a36, 0x447e34];
/** Blossom crowns: the map's pink ramp (veg/proto.ts `RAMPS.pink`) turned purple (crape myrtle's), deep → lit. */
const PURPLE = [0x5e2e7a, 0x6a3488, 0x7e429e, 0x9455b6, 0xab6cca, 0xc18ada];

type Shrub = 'boug' | 'hibiscus' | 'ixora' | 'green';

export function growMeadow(b: VoxelBuilder, fb: VoxelBuilder, field: HeightField, low: boolean): MeadowOut {
  const t0 = performance.now();
  const src = traceSource();
  const n0 = b.boxes.length + fb.boxes.length;
  plantDetail(low ? 'low' : 'medium');

  // ── Stepping stones first (their line kept clear of plants) ──
  const paths = stonePaths(field);
  const nearPath = (x: number, z: number, m: number) => paths.some((p) => toLine(p, x, z) < m);
  for (const [pi, p] of paths.entries()) layStones(fb, field, p, pi, src);

  const tally: Record<string, number> = {};
  let mark = b.boxes.length + fb.boxes.length;
  const count = (what: string) => {
    const now = b.boxes.length + fb.boxes.length;
    tally[what] = (tally[what] ?? 0) + now - mark;
    mark = now;
  };
  count('stones');
  // ── Trees in the far band ──
  const trees: [number, number, number][] = [];
  const maxTrees = low ? 14 : 28;
  for (let t = 0; t < 3000 && trees.length < maxTrees; t++) {
    const a = hash3(t, 1, 0, 611) * Math.PI * 2;
    const d = 9 + hash3(t, 2, 0, 611) * (BAND - 8);
    const [ex, ez] = edgeAt(a);
    let x = ex + Math.cos(a) * d;
    let z = ez + Math.sin(a) * d;
    // (every third try along the avenue's sides instead, well off its line of sight)
    if (t % 3 === 2) {
      const side = hash3(t, 3, 0, 611) < 0.5 ? -1 : 1;
      x = AVENUE.x + side * (13.5 + hash3(t, 4, 0, 611) * 10);
      z = AVENUE.z0 + 4 + hash3(t, 5, 0, 611) * (ARCH.z + 6 - AVENUE.z0 - 4);
    }
    const r = 3.2 + hash3(t, 6, 0, 611) * 2;
    if (z < STAGE.back + 6) continue;
    if (Math.abs(x - AVENUE.x) - r < 10.5 && z > GATE.z - 4) continue;
    if (outOf(x, z) < 8 || rho(x, z) < 1.4 || Math.hypot(x - SALA.x, z - SALA.z) < 10 || nearPath(x, z, r + 0.5)) continue;
    // (thinning outward: groves near the square, fewer far out)
    if (hash3(t, 8, 0, 611) > 1.05 - outOf(x, z) / (BAND + 14)) continue;
    if (trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < (tr + r) * 0.82)) continue;
    if (![[0, 0], [r * 0.6, 0], [-r * 0.6, 0], [0, r * 0.6], [0, -r * 0.6]].every(([dx, dz]) => field.isFree(x + dx, z + dz))) continue;
    const g = field.heightAt(x, z);
    const bloom = trees.length % 3 === 1 ? (trees.length % 2 ? 'purple' : 'pink') : null;
    const p = broadleaf({ s: 1, h: 8 + hash3(t, 7, 0, 611) * 4.5, r, seed: 9700 + t * 13, ...(bloom ? { flower: 'pink' as const } : {}) });
    stamp(b, field, p, x, g, z, 9700 + t, bloom === 'purple' ? toPurple : null);
    field.occupy(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7);
    trees.push([x, z, r]);
  }

  // Farther out, round the band's rim: the map's far trees (2 m cells: a quarter of the blocks), thinning the garden into the land.
  const farMax = trees.length + (low ? 8 : 16);
  for (let t = 0; t < 3000 && trees.length < farMax; t++) {
    const a = hash3(t, 1, 0, 627) * Math.PI * 2;
    const d = 20 + hash3(t, 2, 0, 627) * (BAND - 14);
    const [ex, ez] = edgeAt(a);
    const x = ex + Math.cos(a) * d;
    const z = ez + Math.sin(a) * d;
    const r = 3.6 + hash3(t, 6, 0, 627) * 2;
    if (z < STAGE.back + 6 || (Math.abs(x - AVENUE.x) - r < 10.5 && z > GATE.z - 4)) continue;
    if (Math.hypot(x - SALA.x, z - SALA.z) < 10 || nearPath(x, z, r + 0.5)) continue;
    if (trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < (tr + r) * 0.85)) continue;
    if (![[0, 0], [r * 0.6, 0], [-r * 0.6, 0], [0, r * 0.6], [0, -r * 0.6]].every(([dx, dz]) => field.isFree(x + dx, z + dz))) continue;
    const bloom = hash3(t, 9, 0, 627) < 0.25;
    const p = broadleaf({ s: 2, h: 9 + hash3(t, 7, 0, 627) * 4, r, seed: 9800 + t * 13, ...(bloom ? { flower: 'pink' as const } : {}) });
    stamp(b, field, p, Math.round(x / 2) * 2, field.heightAt(x, z), Math.round(z / 2) * 2, 9800 + t, bloom && t % 2 ? toPurple : null);
    field.occupy(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7);
    trees.push([x, z, r]);
  }
  count('trees');
  // ── Banana clumps ──
  const clumps = low ? 3 : 2;
  for (let c = 0, t = 0; c < clumps && t < 200; t++) {
    const a = hash3(t, 1, 1, 612) * Math.PI * 2;
    const d = 5 + hash3(t, 2, 1, 612) * 12;
    const [ex, ez] = edgeAt(a);
    const x = ex + Math.cos(a) * d;
    const z = ez + Math.sin(a) * d;
    if (z < STAGE.back + 4 || Math.abs(x - AVENUE.x) < 11 || rho(x, z) < 1.34 || nearPath(x, z, 2.5)) continue;
    if (trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + 2)) continue;
    let n = 0;
    for (let k = 0; k < 3; k++) {
      const px = x + (k ? Math.cos(a + k * 2.1) * 2.2 : 0);
      const pz = z + (k ? Math.sin(a + k * 2.1) * 2.2 : 0);
      if (!field.isFree(px, pz)) continue;
      bananaPlant(b, px, field.heightAt(px, pz), pz, { seed: hash3(t, k, 3, 612), yaw: hash3(t, k, 4, 612) * 6.28, stage: k === 2 ? 3 : 4, bunch: k === 0 && !low });
      field.occupy(px - 0.6, pz - 0.6, px + 0.6, pz + 0.6);
      n++;
    }
    if (n) c++;
  }

  count('bananas');
  // ── Ground cover: patches of other greens over the land's own, everywhere in the band (cheap: two thin slabs) ──
  {
    const gstep = low ? 4 : 2.9;
    let n = 0;
    for (let gz = SQUARE.z - SQUARE.rz - BAND; gz <= Math.max(SQUARE.z + SQUARE.rz + BAND, ARCH.z + 8); gz += gstep)
      for (let gx = SQUARE.x - SQUARE.rx - BAND; gx <= SQUARE.x + SQUARE.rx + BAND; gx += gstep) {
        n++;
        const x = gx + (hash3(gx, gz, 1, 626) - 0.5) * gstep;
        const z = gz + (hash3(gx, gz, 2, 626) - 0.5) * gstep;
        const d = outOf(x, z);
        const inAv = z > AVENUE.z0 - 2 && z < ARCH.z + 8 && Math.abs(x - AVENUE.x) < AV_FAR;
        if (d < 2 || (d > BAND && !inAv) || hash3(gx, gz, 3, 626) > 0.75) continue;
        const c = field.index(x, z);
        if (c < 0 || field.trail[c] === 2 || field.occupied[c] || field.waterAt(x, z) !== null || onAvenue(x, z, 1) || nearPath(x, z, 0.8)) continue;
        const g = field.heightAt(x, z);
        // (only on level ground: a patch over a step of the land would float)
        if ([[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dz]) => Math.abs(field.heightAt(x + dx, z + dz) - g) > 0.05)) continue;
        groundPatch(b, x, g, z, n, src);
      }
    count('ground');
  }

  const bushes = bushProtos(low);
  // ── The meadow: a jittered grid, density by distance and drifts of noise ──
  const step = low ? 2.3 : 1.7;
  const x0 = SQUARE.x - SQUARE.rx - BAND - 2;
  const x1 = SQUARE.x + SQUARE.rx + BAND + 2;
  const z0 = SQUARE.z - SQUARE.rz - BAND - 2;
  const z1 = Math.max(SQUARE.z + SQUARE.rz + BAND + 2, ARCH.z + 8);
  let gi = 0;
  for (let gz = z0; gz <= z1; gz += step)
    for (let gx = x0; gx <= x1; gx += step) {
      gi++;
      const x = gx + (hash3(gx, gz, 1, 613) - 0.5) * step * 0.9;
      const z = gz + (hash3(gx, gz, 2, 613) - 0.5) * step * 0.9;
      const d = outOf(x, z);
      if (d < 1.2) continue;
      const dAv = Math.abs(x - AVENUE.x);
      const inAv = z > AVENUE.z0 - 2 && z < ARCH.z + 8;
      const wSq = d < BAND ? Math.pow(1 - d / BAND, 0.8) : 0;
      const wAv = inAv ? Math.max(0, Math.min(1, (AV_FAR - dAv) / (AV_FAR - AV_NEAR))) : 0;
      const w = Math.max(wSq, wAv * 0.95);
      if (w <= 0) continue;
      const c = field.index(x, z);
      if (c < 0 || field.trail[c] === 2 || field.occupied[c] || field.waterAt(x, z) !== null || field.dropAt(x, z) > 1.2) continue;
      if (onSquare(x, z, 1.2) || onAvenue(x, z, 3.3) || nearPath(x, z, 0.7)) continue;
      // (behind the stage only low things: the hill's jungle is there)
      const behind = z < STAGE.front - 1 && x > STAGE.x0 - 6 && x < STAGE.x1 + 6;
      const drift = valueNoise3(x / 9, 0.5, z / 9, 614);
      const fine = valueNoise3(x / 3.2, 4.5, z / 3.2, 615);
      const p = Math.max(w * (0.22 + 1.25 * drift * drift + 0.2 * fine), inAv && dAv < 13 ? 0.5 : 0);
      const r = hash3(x, z, 3, 616);
      if (r > p) continue;
      const g = field.heightAt(x, z);
      const k = hash3(x, z, 4, 616);
      const wet = nearWater(field, x, z, 3.5);
      // Solid things only where the string-light poles and the avenue's pole pairs will not want the ground.
      const solidOk = !behind && field.isFree(x, z) && rho(x, z) > 1.32 && (!inAv || dAv > 9.5) && Math.hypot(x - GATE.x, z - GATE.z) > 9 && !trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr * 0.9);
      const near = Math.min(d, inAv ? Math.max(0, dAv - 6) : Infinity);
      // Ground cover under some (a patch of another green or straw).
      if (wet) {
        reeds(b, x, g, z, gi, low, src);
        count('reeds');
        continue;
      }
      const shrubShare = near < 9 ? 0.55 : near < 20 ? 0.5 : 0.45;
      const flowerShare = near < 9 ? 0.18 : near < 20 ? 0.12 : 0.07;
      if (k < shrubShare && solidOk && near > 5 && hash3(x, z, 8, 616) < (near > 14 ? 0.75 : 0.5)) {
        // A big bush, the map's own: plain, or flowering on its lit side (bougainvillea, ixora).
        const bp = bushes[Math.floor(hash3(x, z, 9, 616) * bushes.length)];
        const f = hash3(x, z, 10, 616);
        const tones = f < 0.3 ? BOUG : f < 0.45 ? BOUG_PURPLE : f < 0.6 ? IXORA : null;
        const share = 0.3 + 0.25 * hash3(x, z, 11, 616);
        stamp(b, field, bp, x, g, z, gi, tones ? (color, c) => (BUSH_LIT.has(color) && hash3(c, gi, 1, 625) < share ? tones[c % tones.length] : color) : null);
        field.occupy(x - bp.r * 0.6, z - bp.r * 0.6, x + bp.r * 0.6, z + bp.r * 0.6);
        count('bushes');
      } else if (k < shrubShare && solidOk) {
        const s = hash3(x, z, 6, 616);
        const kind: Shrub = near > 20 && s < 0.45 ? 'green' : s < 0.34 ? 'boug' : s < 0.6 ? 'hibiscus' : s < 0.86 ? 'ixora' : 'green';
        shrub(b, field, x, g, z, kind, gi, low, src);
        count('shrubs');
      } else if (k < shrubShare + flowerShare) {
        flowerPatch(b, field, x, z, gi, low, src);
        count('flowers');
      } else {
        grassClump(b, x, g, z, gi, near > 8 || behind, low, src);
        count('grass');
      }
    }

  const blocks = b.boxes.length + fb.boxes.length - n0;
  const ms = performance.now() - t0;
  console.info(`[map] nye meadow: ${blocks} blocks (${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', ')}) · ${trees.length} trees · built in ${ms.toFixed(1)} ms`);
  return { blocks, ms };
}

// ── Where ──

/** How far (m) a point lies outside the square's ellipse (negative inside), along its ray from the middle. */
function outOf(x: number, z: number): number {
  const dx = x - SQUARE.x;
  const dz = z - SQUARE.z;
  const r = Math.hypot(dx, dz) || 1e-6;
  const c = dx / r;
  const s = dz / r;
  return r - 1 / Math.sqrt((c * c) / (SQUARE.rx * SQUARE.rx) + (s * s) / (SQUARE.rz * SQUARE.rz));
}

/** The ellipse's own radius measure (1 on the square's edge). */
function rho(x: number, z: number): number {
  return Math.hypot((x - SQUARE.x) / SQUARE.rx, (z - SQUARE.z) / SQUARE.rz);
}

/** The square's edge toward angle `a` (radians, from its middle). */
function edgeAt(a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const R = 1 / Math.sqrt((c * c) / (SQUARE.rx * SQUARE.rx) + (s * s) / (SQUARE.rz * SQUARE.rz));
  return [SQUARE.x + c * R, SQUARE.z + s * R];
}

function nearWater(field: HeightField, x: number, z: number, m: number): boolean {
  for (const [dx, dz] of [
    [m, 0],
    [-m, 0],
    [0, m],
    [0, -m],
    [m * 0.5, 0],
    [-m * 0.5, 0],
  ])
    if (field.waterAt(x + dx, z + dz) !== null) return true;
  return false;
}

type Line = readonly [number, number][];

function toLine(p: Line, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return best;
}

/**
 * The stepping-stone paths: the sala's steps (its east side, toward the square) south round the square's west trees
 * to the back trail; the gate's forecourt east over the picnic trail to the stream's ghat (where the water is).
 */
function stonePaths(field: HeightField): Line[] {
  const out: Line[] = [];
  const sx = SALA.x + SALA.w / 2 + 1.8;
  out.push([
    [sx, SALA.z + 1.5],
    [sx - 0.6, SALA.z + 7],
    [sx + 0.8, SALA.z + 13],
    [sx + 3.2, SALA.z + 19],
    [sx + 5.6, SALA.z + 24.5],
  ]);
  // The ghat: the stream's west edge a little north of the gate's line.
  const gz = GATE.z - 5;
  let xw = -1;
  for (let x = 424; x <= 448; x += 0.5)
    if (field.waterAt(x, gz) !== null) {
      xw = x;
      break;
    }
  if (xw > 0)
    out.push([
      [GATE.x + 13, GATE.z + 3.5],
      [GATE.x + 20, GATE.z + 1.5],
      [GATE.x + 28, GATE.z - 2],
      [(GATE.x + 28 + xw - 4.4) / 2, gz - 0.6],
      [xw - 4.4, gz],
    ]);
  return out;
}

/** Flat stones every ≈ 0.85 m along a path, a little to either side, off trails' treads, water and what is built. */
function layStones(fb: VoxelBuilder, field: HeightField, p: Line, seed: number, src: SourceTrace | undefined): void {
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / 0.85));
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    for (let s = 0; s < n; s++) {
      const h = hash3(seed, i, s, 617);
      const off = (s % 2 ? 0.17 : -0.17) + (h - 0.5) * 0.12;
      const x = ax + ux * (s + 0.5) * (L / n) - uz * off;
      const z = az + uz * (s + 0.5) * (L / n) + ux * off;
      const c = field.index(x, z);
      if (c < 0 || field.trail[c] === 2 || field.waterAt(x, z) !== null || onSquare(x, z, 0.5) || onAvenue(x, z, 0.5)) continue;
      const w = 0.5 + 0.18 * h;
      const tone = h < 0.6 ? pick(PAVER, x, z, 1, 618) : pick(LATERITE, x, z, 2, 618);
      fb.box(x, field.heightAt(x, z) + 0.035, z, w, 0.07, w * (0.78 + 0.2 * hash3(seed, i, s, 619)), tone, 'mapStone', { src, ry: Math.atan2(ux, uz) + (h - 0.5) * 0.7, shade: 0.92 + 0.12 * h });
    }
    // (a narrow strip kept for the stones: the vegetation's trees keep off)
    for (let s = 0; s <= n; s += 2) {
      const x = ax + ux * s * (L / n);
      const z = az + uz * s * (L / n);
      if (field.trail[field.index(x, z)] !== 2) field.occupy(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    }
  }
}

// ── What grows ──

/** The pink blossom of a flowering prototype turned purple (crape myrtle's, as the garden's). */
function toPurple(color: number): number {
  const at = (RAMPS.pink as readonly number[]).indexOf(color);
  return at >= 0 ? PURPLE[at] : color;
}

/** The lit, outer tones of the bushes' ramps (veg/proto.ts `RAMPS`): where a flowering bush shows its flowers. */
const BUSH_LIT = new Set<number>([RAMPS.bush, RAMPS.deep, RAMPS.jungle].flatMap((r) => r.slice(3)));

/** The map's bush prototypes (veg/species.ts `bush`), a few sizes, made once a build. */
function bushProtos(low: boolean): Proto[] {
  const out: Proto[] = [];
  for (let i = 0; i < (low ? 4 : 7); i++) out.push(bush({ s: 1, h: 1.6 + (i % 3) * 0.5, r: 1.5 + (i % 4) * 0.4, seed: 9900 + i * 17 }));
  return out;
}

/** A low patch of another green (or straw) over the land's grass: two thin slabs crossed at an angle. */
function groundPatch(b: VoxelBuilder, x: number, g: number, z: number, seed: number, src: SourceTrace | undefined): void {
  const h = hash3(seed, 1, 0, 620);
  const c = MOSS[Math.floor(hash3(seed, 2, 0, 620) * MOSS.length)];
  const w = 1.1 + 0.8 * h;
  const ry = hash3(seed, 3, 0, 620) * Math.PI;
  // (three slabs turned apart, overlapping: a ragged patch, not a square)
  for (let i = 0; i < 3; i++) {
    const a = ry + i * 2.1;
    const r = i ? w * 0.45 : 0;
    const s = w * (i ? 0.7 + 0.25 * hash3(seed, 4 + i, 0, 620) : 1);
    b.box(x + Math.cos(a) * r, g + 0.02 + 0.006 * i, z + Math.sin(a) * r, s, 0.04 + 0.012 * i, s * (0.6 + 0.3 * hash3(seed, 7 + i, 0, 620)), c, 'mapLeaf', { src, ry: a * 1.7, shade: 0.94 + 0.05 * i });
  }
}

/** A clump of thin blades leaning out from its foot (tall: 1‥1.6 m, else 0.5‥0.9 m), straw tips on some. */
function grassClump(b: VoxelBuilder, x: number, g: number, z: number, seed: number, tall: boolean, low: boolean, src: SourceTrace | undefined): void {
  const n = (low ? 3 : 4) + (tall && !low ? 1 : 0);
  const H = tall ? 1.0 + 0.6 * hash3(seed, 0, 1, 621) : 0.5 + 0.4 * hash3(seed, 0, 1, 621);
  const a0 = hash3(seed, 0, 2, 621) * Math.PI * 2;
  const tone = GRASS[Math.floor(hash3(seed, 0, 3, 621) * GRASS.length)];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (hash3(seed, i, 4, 621) - 0.5) * 0.9;
    const lean = 0.12 + 0.38 * hash3(seed, i, 5, 621);
    const L = H * (0.7 + 0.3 * hash3(seed, i, 6, 621));
    const foot: P3 = [x + Math.cos(a) * 0.07, g - 0.02, z + Math.sin(a) * 0.07];
    const tip: P3 = [foot[0] + Math.cos(a) * Math.sin(lean) * L, g + Math.cos(lean) * L, foot[2] + Math.sin(a) * Math.sin(lean) * L];
    const c = i % 3 === 2 && tall ? GRASS_TIP[i % GRASS_TIP.length] : tone;
    beam(b, foot, tip, low ? 0.12 : 0.085, 0.03, c, 'mapLeaf', a, 0.9 + 0.2 * hash3(seed, i, 7, 621), src);
  }
}

/** Reeds by the water: tall dark blades, two with a brown cattail head. */
function reeds(b: VoxelBuilder, x: number, g: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const n = low ? 4 : 7;
  const a0 = hash3(seed, 0, 2, 622) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const lean = 0.05 + 0.22 * hash3(seed, i, 5, 622);
    const L = 1.5 + 0.9 * hash3(seed, i, 6, 622);
    const foot: P3 = [x + Math.cos(a) * 0.1, g - 0.05, z + Math.sin(a) * 0.1];
    const tip: P3 = [foot[0] + Math.cos(a) * Math.sin(lean) * L, g + Math.cos(lean) * L, foot[2] + Math.sin(a) * Math.sin(lean) * L];
    beam(b, foot, tip, 0.06, 0.04, REED[i % REED.length], 'mapLeaf', a, 1, src);
    if (i < 2) b.box(tip[0], tip[1] - 0.25, tip[2], 0.09, 0.32, 0.09, CATTAIL[i], 'mapBark', { src, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean });
  }
}

/** A flowering shrub: overlapping leafy lumps turned every way on a dome, flowers on its top and sides. */
function shrub(b: VoxelBuilder, field: HeightField, x: number, g: number, z: number, kind: Shrub, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const rnd = (i: number, j = 0) => hash3(seed, i, j, 623);
  const [R, H] =
    kind === 'boug' ? [1.3 + 0.9 * rnd(1), 1.3 + 0.9 * rnd(2)] : kind === 'hibiscus' ? [0.9 + 0.4 * rnd(1), 1.8 + 0.8 * rnd(2)] : kind === 'ixora' ? [0.7 + 0.35 * rnd(1), 0.8 + 0.4 * rnd(2)] : [1.1 + 0.8 * rnd(1), 1.2 + 0.9 * rnd(2)];
  const leaves = kind === 'green' ? GREEN_BUSH : SHRUB_LEAF;
  const lumps = (low ? 3 : 5) + (R > 1.5 && !low ? 2 : 0);
  const a0 = rnd(3) * Math.PI * 2;
  const tops: P3[] = [];
  for (let q = 0; q < lumps; q++) {
    const a = a0 + (q / lumps) * Math.PI * 2 + (rnd(10 + q) - 0.5) * 0.8;
    const centre = q === 0;
    const rr = centre ? 0 : R * (0.4 + 0.3 * rnd(20 + q));
    const s = (centre ? R * 1.05 : R * (0.6 + 0.3 * rnd(30 + q))) * (kind === 'hibiscus' ? 0.95 : 1);
    const sy = kind === 'hibiscus' ? s * 1.2 : s * 0.82;
    const y = centre ? g + H - sy * 0.55 : g + Math.max(sy * 0.42, H * (0.3 + 0.35 * rnd(40 + q)));
    const lx = x + Math.cos(a) * rr;
    const lz = z + Math.sin(a) * rr;
    const lit = (y - g) / H;
    const tone = leaves[Math.max(0, Math.min(leaves.length - 1, Math.round(lit * 3 + rnd(50 + q) * 1.6 - 0.4)))];
    b.box(lx, y, lz, s, sy, s, tone, 'mapLeaf', { src, ry: rnd(60 + q) * 1.6, rx: (rnd(70 + q) - 0.5) * 0.5, rz: (rnd(80 + q) - 0.5) * 0.5, shade: 0.9 + 0.15 * lit });
    tops.push([lx, y + sy * 0.5, lz]);
    void field;
  }
  if (kind === 'green') return;
  const fl = low ? 4 : kind === 'boug' ? 11 : 8;
  const purple = kind === 'boug' && rnd(90) < 0.35;
  const tones = kind === 'boug' ? (purple ? BOUG_PURPLE : BOUG) : kind === 'hibiscus' ? HIBISCUS : IXORA;
  for (let f = 0; f < fl; f++) {
    const t = tops[Math.floor(rnd(100 + f) * tops.length)];
    const a = rnd(110 + f) * Math.PI * 2;
    const out = R * (0.15 + 0.45 * rnd(120 + f));
    const fx = t[0] + Math.cos(a) * out;
    const fz = t[2] + Math.sin(a) * out;
    const fy = t[1] - 0.05 - 0.45 * rnd(130 + f) * (out / R);
    const c = tones[Math.floor(rnd(140 + f) * tones.length)];
    if (kind === 'boug') b.box(fx, fy, fz, 0.38, 0.26, 0.38, c, 'petal', { src, ry: a, rx: 0.3 * (rnd(150 + f) - 0.5) });
    else if (kind === 'hibiscus') {
      // (a flat open flower turned 45°, its red pistil standing out)
      b.box(fx, fy, fz, 0.22, 0.06, 0.22, c, 'petal', { src, ry: Math.PI / 4 + a, rx: -0.5 * Math.sin(a), rz: 0.5 * Math.cos(a) });
      if (!low && f % 2 === 0) b.box(fx, fy + 0.06, fz, 0.04, 0.1, 0.04, 0xf3c23a, 'petal', { src });
    } else b.box(fx, fy, fz, 0.2, 0.15, 0.2, c, 'petal', { src, ry: a });
  }
}

/** A small patch of marigolds or periwinkles: a leafy tuft and its flower head each. */
function flowerPatch(b: VoxelBuilder, field: HeightField, x: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const marigold = hash3(seed, 0, 1, 624) < 0.55;
  const n = 2 + Math.floor(hash3(seed, 0, 2, 624) * (low ? 2 : 3));
  const tones = marigold ? MARIGOLD : PERIWINKLE;
  const base = tones[Math.floor(hash3(seed, 0, 3, 624) * tones.length)];
  for (let i = 0; i < n; i++) {
    const a = hash3(seed, i, 4, 624) * Math.PI * 2;
    const r = 0.25 + 0.55 * hash3(seed, i, 5, 624);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    if (field.waterAt(px, pz) !== null) continue;
    const g = field.heightAt(px, pz);
    const h = hash3(seed, i, 6, 624);
    const c = h < 0.7 ? base : tones[Math.floor(h * 10) % tones.length];
    if (marigold) {
      const s = 0.22 + 0.08 * h;
      b.box(px, g + s * 0.45, pz, s, s * 0.9, s, FLOWER_LEAF[i % FLOWER_LEAF.length], 'mapLeaf', { src, ry: h * 2 });
      b.box(px, g + s * 0.95, pz, s * 0.72, 0.12, s * 0.72, c, 'petal', { src, ry: h * 3 + 0.4 });
    } else {
      const s = 0.26 + 0.1 * h;
      b.box(px, g + 0.07, pz, s, 0.14, s, FLOWER_LEAF[(i + 1) % FLOWER_LEAF.length], 'mapLeaf', { src, ry: h * 2 });
      b.box(px + 0.04, g + 0.16, pz, 0.15, 0.035, 0.15, c, 'petal', { src, ry: Math.PI / 4 + h });
    }
  }
}

/**
 * Stamp a map tree prototype (veg/species.ts) with its trunk at (x, y, z), as `_sqKit.ts` `stampTree`, its blossom
 * its leaf colours changed by `recolor` when given (blossom turned purple, flowers on a bush).
 */
function stamp(b: VoxelBuilder, f: HeightField, p: Proto, x: number, y: number, z: number, seed: number, recolor: ((color: number, c: number) => number) | null): void {
  const s = p.s;
  const q = seed & 3;
  const turn = (i: number, k: number): [number, number] => (q === 0 ? [i, k] : q === 1 ? [-k, i] : q === 2 ? [-i, -k] : [k, -i]);
  for (let c = 0; c < p.n; c++) {
    if (!p.shell[c]) continue;
    const [i, k] = turn(p.ci[c], p.ck[c]);
    const cx = x + i * s;
    const cz = z + k * s;
    const cy = y + (p.cj[c] + 0.5) * s;
    if (cy - s / 2 < f.heightAt(cx, cz) - 0.05) continue;
    const color = recolor && !p.mat[c] ? recolor(p.color[c], c) : p.color[c];
    b.box(cx, cy, cz, s, s, s, color, p.mat[c] ? 'mapBark' : 'mapLeaf', { src: p.src, shade: p.shade[c] });
  }
  for (const bx of p.boxes) {
    const [ox, oz] = turn(bx.x, bx.z);
    const odd = (q & 1) === 1;
    b.box(x + ox, y + bx.y, z + oz, odd ? bx.sz : bx.sx, bx.sy, odd ? bx.sx : bx.sz, bx.color, bx.leaf ? 'mapLeaf' : 'mapBark', { src: p.src, shade: bx.shade });
  }
}
