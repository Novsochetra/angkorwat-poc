import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import { SURFACE, type HeightField } from '../heightfield';
import { Frame, type Lamps } from '../landmarks/_prasatKit';
import { bananaPlant } from '../veg/banana';
import { plantDetail } from '../veg/detail';
import { palmProto } from '../veg/palms';
import type { Proto } from '../veg/proto';
import { broadleaf } from '../veg/species';
import { BAMBOO, drapedNet, Local, skiff, tone, traps } from '../village/_kit';
import { LAKE_AVENUE, LAKE_POND, LAKE_SHORE, LAKE_VIEW, lakePlazaAt, onLakeLanding, onLakeShore } from './plan';
import { champa, crown, lilyPad, lotus, type NyeTree } from './_sqGarden';
import { khmerLamp, LATERITE, PAVER, pick } from './_sqKit';
import { BOUG, BOUG_PURPLE, BUSH_LIT, bushProtos, flowerPatch, grassClump, groundPatch, IXORA, reeds, shrub, stamp, toLine, toPurple, type Line, type MeadowOut, type Shrub } from './_sqMeadow';
import type { LakeFrame } from './_lkKit';

/**
 * The lake venue's surroundings (AWP-35, lake.ts; the owner on the bare field round Kulen's square: "seems so silent,
 * not wow"): the shore terrace (plan.ts `LAKE_SHORE`) in a lakeside garden, as the square's (`_sqMeadow.ts`
 * `growMeadow`, whose plants it shares), out to ≈ 45 m round the terrace, dense near it and thinning outward, in drifts
 * (seeded value noise), never in rows:
 *
 * - **groves** of the map's own broadleaf trees, a third in pink or purple blossom, framing the terrace on both sides
 *   and behind it, and two or three of the square's flowering trees near its rim (`_sqGarden.ts` `crown`, `champa`);
 * - **palms by the water**: sugar palms (ត្នោត) and coconut palms on the bank's top and the sand either side of the
 *   ghat (the map's palm prototypes, veg/palms.ts `palmProto`: blocks, no draw of their own);
 * - **banana clumps**, flowering shrubs (bougainvillea, hibiscus, ixora), the map's bushes some in flower, tall grass,
 *   marigold and periwinkle patches, patches of other greens over the land's grass (all `_sqMeadow.ts`'s);
 * - **by the water**: reeds with cattails along the sand's edge, lily pads and lotus in the shallows either side of
 *   the ghat (the kit: soft, bobbing);
 * - **the fishermen's corner** on the village side (the floating village's own props, village/_kit.ts): nets drying
 *   on bamboo poles, fish traps, a rack of small fish drying in the sun, a skiff pulled up on the sand;
 * - **stepping stones** from the terrace's rim to the fishermen's corner and into the west grove.
 *
 * Kept clear: the terrace and its rim (`onLakeShore`), the landing, ghat and jetty and the water between the terrace
 * and the stage (`onLakeLanding` and the band either side), the lake trail and the east shore trail and the paths to
 * them (trails' treads, `field.occupied`), the lakeside crowd's way in from the east shore trail, and nothing tall in
 * the views over the stage to the lake (`LAKE_VIEW`, the terrace's front: `SIGHTS`).
 *
 * Everything goes into the shore's builder and families (stone, leaf, bark, petal) and the venue's kit and glow: no
 * draw of its own. Plants are soft (leaf, petal); trunks, banana stems, the bushes' ground, the nets' frames and the
 * boat are `occupied`, so the vegetation part's trees keep off. Static (the part is FROZEN).
 */

/** How far out the garden reaches past the terrace's edge (m). */
const BAND = 45;

/**
 * The views kept open (map x, z): the crowd camera on the plaza's back and from the plaza's front, both over the stage;
 * and the two views over the whole plaza from above its gate side (the owner's free camera, the reference's angle).
 */
const SIGHTS: readonly { c: readonly [number, number]; at: readonly [number, number] }[] = [
  { c: [LAKE_VIEW.cam[0], LAKE_VIEW.cam[2]], at: [LAKE_VIEW.at[0], LAKE_VIEW.at[2]] },
  { c: [-352, -54], at: [-372, -25] },
  { c: [-312, -104], at: [-362, -38] },
  { c: [-324, -88], at: [-360, -36] },
];

/** The avenue from the trails up to the plaza's gate (plan.ts `LAKE_AVENUE`): crowns keep off it, so it is seen. */
const AVENUE: Line = [lakePlazaAt(LAKE_AVENUE.phi, LAKE_AVENUE.r0), lakePlazaAt(LAKE_AVENUE.phi, LAKE_AVENUE.r1)];

/** The crowd's way in (people/_nyeLakePlan.ts `TRAIL`'s end and its `ENTRY`): kept free of anything solid. */
const CROWD_WAY: Line = [
  [-282, -28],
  [-292, -60],
  [-306, -63],
  [LAKE_SHORE.x + LAKE_SHORE.rx - 2.5, LAKE_SHORE.z + 1],
];

/** Small fish drying on the rack (silver, a little gold). */
const FISH = [0xb8b4a6, 0xc4bea8, 0xa8a496, 0xcab48a];
/** Coarse matting under them. */
const MATTING = 0xb09868;

export function growLakeMeadow(b: VoxelBuilder, kit: Kit, glow: Glow, field: HeightField, fr: LakeFrame, low: boolean, lamps: Lamps | null = null): MeadowOut {
  const t0 = performance.now();
  const src = traceSource();
  const n0 = b.boxes.length;
  const k0 = kit.count;
  plantDetail(low ? 'low' : 'medium');
  const wet = (x: number, z: number) => field.waterAt(x, z) !== null;

  const tally: Record<string, number> = {};
  let mark = n0;
  let kmark = k0;
  const count = (what: string) => {
    const now = b.boxes.length;
    tally[what] = (tally[what] ?? 0) + now - mark + kit.count - kmark;
    mark = now;
    kmark = kit.count;
  };

  // ── Where the bank is, per strip across the stage's frame: the 8 m land's edge, the water's ──
  const banks = new Map<number, { bank: number; water: number }>();
  const bankAt = (uu: number): { bank: number; water: number } => {
    const u = Math.round(uu);
    const known = banks.get(u);
    if (known) return known;
    let bank = 70;
    for (let v = 70; v > -20; v -= 0.5) {
      const [x, z] = fr.at(u, v);
      if (field.heightAt(x, z) < 7.5 || wet(x, z)) {
        bank = v + 0.5;
        break;
      }
    }
    let water = bank;
    for (let v = bank; v > -30; v -= 0.5) {
      const [x, z] = fr.at(u, v);
      if (wet(x, z)) {
        water = v + 0.5;
        break;
      }
    }
    const out = { bank, water };
    banks.set(u, out);
    return out;
  };
  const centre = fr.local(LAKE_SHORE.x, LAKE_SHORE.z);

  /** Tall things keep out of the views over the stage (`r` the thing's radius, m). */
  const inSight = (x: number, z: number, r: number, half = 0.3) =>
    SIGHTS.some(({ c, at }) => {
      const dx = x - c[0];
      const dz = z - c[1];
      const lx = at[0] - c[0];
      const lz = at[1] - c[1];
      const L = Math.hypot(lx, lz);
      const along = (dx * lx + dz * lz) / L;
      if (along < -r) return false;
      const side = Math.abs(dx * lz - dz * lx) / L;
      return side < Math.max(0, along) * Math.tan(half) + r + 1;
    });
  /** Between the terrace and the stage (the landing, the ghat, the jetty, the water before it and a band either side). */
  const beforeTerrace = (x: number, z: number, r: number) => {
    const [u, v] = fr.local(x, z);
    return onLakeLanding(x, z, 2 + r) || (v < centre[1] - 6 && Math.abs(u) < 15 + r);
  };
  /** Room for something solid of radius `r`. */
  const solidOk = (x: number, z: number, r: number) =>
    !beforeTerrace(x, z, r) && !onLakeShore(x, z, 1.6 + r) && toLine(CROWD_WAY, x, z) > 2.6 + r && !nearPath(x, z, r + 0.5) && toLine(AVENUE, x, z) > LAKE_AVENUE.w / 2 + 2.2 + r && Math.hypot(x - LAKE_POND.x, z - LAKE_POND.z) > LAKE_POND.rx + 1.2 + r * 0.6;

  // ── The fishermen's corner (first: the stones lead to it), on the village side (−u) by the bank ──
  const paths: Line[] = [];
  const nearPath = (x: number, z: number, m: number) => paths.some((p) => toLine(p, x, z) < m);
  const corner = fishermen(b, field, fr, bankAt, low, src);
  count('fishermen');

  // ── Stepping stones: from beside the landing (the ring wall closes the plaza's sides) to the fishermen's nets, and
  // into the west grove ──
  if (corner) paths.push(stonePath(fr.at(-11.2, bankAt(-11).bank + 0.9), corner.at, corner.from));
  {
    const [wx, wz] = fr.at(27, bankAt(27).bank + 4);
    paths.push(stonePath(fr.at(11.2, bankAt(11).bank + 1.2), [wx, wz], 0));
  }
  for (const [pi, p] of paths.entries()) layStones(b, field, p, pi, src);
  count('stones');

  // ── The square's flowering trees by the terrace's rim (crape myrtle, trumpet tree, frangipani) ──
  const trees: [number, number, number][] = [];
  const NEAR: Omit<NyeTree, 'x' | 'z'>[] = [
    { kind: 'myrtle', bloom: 'pink', h: 9.5, r: 3.8, edge: false },
    { kind: 'champa', bloom: 'white', h: 6.5, r: 3, edge: false },
  ];
  // (the venue's own four: _lkShore.ts; their crowns keep these off by `occupied`)
  for (let t = 0, i = 0; t < 600 && i < NEAR.length; t++) {
    const spec = NEAR[i];
    if (low && spec.extra) break;
    // (round the back and the sides: θ from the terrace's middle, away from the water)
    const a = hash3(t, 1, 0, 641) * Math.PI * 2;
    const d = 4.5 + spec.r + hash3(t, 2, 0, 641) * 6;
    const [ex, ez] = edgeAt(a);
    const x = ex + Math.cos(a) * d;
    const z = ez + Math.sin(a) * d;
    if (fr.local(x, z)[1] < centre[1] - 4) continue;
    if (!solidOk(x, z, spec.r * 0.6) || inSight(x, z, spec.r) || !roomFor(field, x, z, spec.r)) continue;
    if (trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < (tr + spec.r) * 1.2)) continue;
    const g = field.heightAt(x, z);
    const nt: NyeTree = { ...spec, x, z };
    if (spec.kind === 'champa') champa(b, kit, glow, field, nt, x, g, z, 7400 + i, low, src);
    else crown(b, kit, kit, glow, field, nt, x, g, z, 7400 + i, low, src);
    field.occupy(x - spec.r * 0.7, z - spec.r * 0.7, x + spec.r * 0.7, z + spec.r * 0.7);
    trees.push([x, z, spec.r]);
    i++;
  }
  count('blossom trees');

  // ── Groves of the map's trees, thinning outward ──
  const greens = [0, 1, 2, 3, 4].map((i) => broadleaf({ s: 1, h: 8 + i * 1.1, r: 3.2 + ((i * 3) % 5) * 0.5, seed: 9700 + i * 13 }));
  const blooms = [0, 1, 2].map((i) => broadleaf({ s: 1, h: 8.5 + i * 1.5, r: 3.4 + i * 0.8, seed: 9760 + i * 13, flower: 'pink' }));
  const farGreens = [0, 1, 2].map((i) => broadleaf({ s: 2, h: 9 + i * 2, r: 3.6 + i, seed: 9800 + i * 13 }));
  const farBlooms = [0, 1].map((i) => broadleaf({ s: 2, h: 10 + i * 2, r: 4 + i, seed: 9840 + i * 13, flower: 'pink' }));
  const grove = (n: number, dMin: number, dMax: number, far: boolean, salt: number) => {
    const goal = trees.length + n;
    for (let t = 0; t < 4000 && trees.length < goal; t++) {
      const a = hash3(t, 1, 0, salt) * Math.PI * 2;
      const d = dMin + hash3(t, 2, 0, salt) * (dMax - dMin);
      const [ex, ez] = edgeAt(a);
      const x = ex + Math.cos(a) * d;
      const z = ez + Math.sin(a) * d;
      const bloom = far ? (hash3(t, 9, 0, salt) < 0.3 ? (t % 2 ? 'purple' : 'pink') : null) : trees.length % 3 === 1 ? (trees.length % 2 ? 'purple' : 'pink') : null;
      const pool = far ? (bloom ? farBlooms : farGreens) : bloom ? blooms : greens;
      const p = pool[Math.floor(hash3(t, 6, 0, salt) * pool.length)];
      const r = p.r;
      if (!solidOk(x, z, r * 0.7) || inSight(x, z, r)) continue;
      // (thinning outward: groves near the terrace, fewer far out)
      if (hash3(t, 8, 0, salt) > 1.1 - outOf(x, z) / (BAND + 12)) continue;
      if (trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < (tr + r) * (far ? 0.85 : 0.8))) continue;
      if (!roomFor(field, x, z, r)) continue;
      const g = field.heightAt(x, z);
      if (far) stamp(b, field, p, Math.round(x / 2) * 2, g, Math.round(z / 2) * 2, 9900 + t, bloom === 'purple' ? toPurple : null);
      else stamp(b, field, p, x, g, z, 9700 + t, bloom === 'purple' ? toPurple : null);
      field.occupy(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7);
      trees.push([x, z, r]);
    }
  };
  grove(low ? 6 : 12, 8.5, BAND - 12, false, 643);
  grove(low ? 5 : 10, 22, BAND, true, 647);
  count('trees');

  // ── Palms by the water: sugar and coconut palms on the bank's top and the sand, either side of the ghat ──
  const palms: Proto[] = [0, 1, 2, 3, 4, 5].map((i) => palmProto({ s: 1, h: 9 + (i % 3) * 1.6, seed: 2 + i * 3 + (i % 3 === 2 ? 0 : 1) }));
  // (seed % 3 === 2: a coconut palm; the rest sugar palms)
  const nPalms = low ? 8 : 12;
  const placed: [number, number][] = [];
  for (let t = 0; t < 800 && placed.length < nPalms; t++) {
    const side = t % 2 ? 1 : -1;
    const u = side * (15 + hash3(t, 1, 0, 651) * 34);
    const { bank, water } = bankAt(u);
    // (on the top just over the bank's edge, or down on the sand)
    const sand = hash3(t, 2, 0, 651) < 0.45 && bank - water > 2.2;
    const v = sand ? water + 1.2 + hash3(t, 3, 0, 651) * Math.max(0, bank - water - 2.4) : bank + 0.8 + hash3(t, 3, 0, 651) * 4;
    const [x, z] = fr.at(u, v);
    const c = field.index(x, z);
    if (c < 0 || wet(x, z) || field.trail[c] === 2) continue;
    if (sand ? field.surface[c] !== SURFACE.sand : !field.isFree(x, z)) continue;
    if (beforeTerrace(x, z, 1) || inSight(x, z, 2.2, 0.22) || toLine(CROWD_WAY, x, z) < 3 || nearPath(x, z, 1.2)) continue;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5.5) || trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + 1.5)) continue;
    const p = palms[Math.floor(hash3(t, 4, 0, 651) * palms.length)];
    stamp(b, field, p, x, field.heightAt(x, z), z, 5000 + t, null);
    field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
    placed.push([x, z]);
  }
  count('palms');

  // ── Banana clumps: by the fishermen's corner and round the back ──
  {
    const want = 2;
    let made = 0;
    for (let t = 0; t < 400 && made < want; t++) {
      const a = hash3(t, 1, 1, 652) * Math.PI * 2;
      const d = 4 + hash3(t, 2, 1, 652) * 18;
      let [x, z] = edgeAt(a);
      x += Math.cos(a) * d;
      z += Math.sin(a) * d;
      // (the first by the fishermen's corner)
      if (made < 1 && corner) {
        const ca = hash3(t, 5, 1, 652) * Math.PI * 2;
        x = corner.at[0] + Math.cos(ca) * (5 + 3 * hash3(t, 6, 1, 652));
        z = corner.at[1] + Math.sin(ca) * (5 + 3 * hash3(t, 6, 1, 652));
      }
      if (!solidOk(x, z, 2.5) || inSight(x, z, 2.5)) continue;
      if (trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + 2) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3)) continue;
      let n = 0;
      for (let k = 0; k < (low ? 3 : 2); k++) {
        const px = x + (k ? Math.cos(a + k * 2.1) * 2.2 : 0);
        const pz = z + (k ? Math.sin(a + k * 2.1) * 2.2 : 0);
        if (!field.isFree(px, pz)) continue;
        bananaPlant(b, px, field.heightAt(px, pz), pz, { seed: hash3(t, k, 3, 652), yaw: hash3(t, k, 4, 652) * 6.28, stage: k === 0 ? 4 : 3, bunch: k === 0 && !low });
        field.occupy(px - 0.6, pz - 0.6, px + 0.6, pz + 0.6);
        n++;
      }
      if (n) {
        made++;
        trees.push([x, z, 2]);
      }
    }
  }
  count('bananas');

  // ── Ground cover: patches of other greens over the land's own ──
  const { x: cx, z: cz, rx, rz } = LAKE_SHORE;
  const X0 = cx - rx - BAND;
  const X1 = cx + rx + BAND;
  const Z0 = cz - rz - BAND;
  const Z1 = cz + rz + BAND;
  {
    const gstep = low ? 5.6 : 4.4;
    let n = 0;
    for (let gz = Z0; gz <= Z1; gz += gstep)
      for (let gx = X0; gx <= X1; gx += gstep) {
        n++;
        const x = gx + (hash3(gx, gz, 1, 653) - 0.5) * gstep;
        const z = gz + (hash3(gx, gz, 2, 653) - 0.5) * gstep;
        const d = outOf(x, z);
        if (d < 2 || d > BAND || hash3(gx, gz, 3, 653) > 0.85 - 0.4 * (d / BAND)) continue;
        const c = field.index(x, z);
        if (c < 0 || field.trail[c] === 2 || field.occupied[c] || wet(x, z) || beforeTerrace(x, z, 0) || nearPath(x, z, 0.8)) continue;
        const g = field.heightAt(x, z);
        if ([[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dz]) => Math.abs(field.heightAt(x + dx, z + dz) - g) > 0.05)) continue;
        groundPatch(b, x, g, z, n + 31000, src);
      }
    count('ground');
  }

  // ── The meadow: a jittered grid, density by distance and drifts of noise ──
  const bushes = bushProtos(low);
  const step = low ? 2.5 : 1.9;
  let gi = 40000;
  for (let gz = Z0; gz <= Z1; gz += step)
    for (let gx = X0; gx <= X1; gx += step) {
      gi++;
      const x = gx + (hash3(gx, gz, 1, 654) - 0.5) * step * 0.9;
      const z = gz + (hash3(gx, gz, 2, 654) - 0.5) * step * 0.9;
      const d = outOf(x, z);
      if (d < 1.4 || d > BAND) continue;
      const w = Math.pow(1 - d / BAND, 0.9);
      const c = field.index(x, z);
      if (c < 0 || field.trail[c] === 2 || field.occupied[c] || wet(x, z) || field.dropAt(x, z) > 1.2) continue;
      if (onLakeShore(x, z, 1.4) || onLakeLanding(x, z, 1.5) || nearPath(x, z, 0.7)) continue;
      const drift = valueNoise3(x / 9, 2.5, z / 9, 655);
      const fine = valueNoise3(x / 3.2, 6.5, z / 3.2, 656);
      const p = 0.88 * w * (0.22 + 1.25 * drift * drift + 0.2 * fine);
      if (hash3(x, z, 3, 657) > p) continue;
      const g = field.heightAt(x, z);
      const k = hash3(x, z, 4, 657);
      // (the band before the terrace, down to the bank: only low things, the view stays open)
      const open = beforeTerrace(x, z, 1) || inSight(x, z, 1.5);
      const solid = !open && field.isFree(x, z) && solidOk(x, z, 1.2) && !trees.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr * 0.9) && !placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.6);
      const shrubShare = d < 9 ? 0.5 : d < 22 ? 0.45 : 0.38;
      const flowerShare = d < 9 ? 0.2 : d < 22 ? 0.13 : 0.07;
      if (k < shrubShare && solid && d > 5 && hash3(x, z, 8, 657) < (d > 16 ? 0.55 : 0.4)) {
        const bp = bushes[Math.floor(hash3(x, z, 9, 657) * bushes.length)];
        const f = hash3(x, z, 10, 657);
        const tones = f < 0.3 ? BOUG : f < 0.45 ? BOUG_PURPLE : f < 0.6 ? IXORA : null;
        const share = 0.3 + 0.25 * hash3(x, z, 11, 657);
        stamp(b, field, bp, x, g, z, gi, tones ? (color, ci) => (BUSH_LIT.has(color) && hash3(ci, gi, 1, 658) < share ? tones[ci % tones.length] : color) : null);
        field.occupy(x - bp.r * 0.6, z - bp.r * 0.6, x + bp.r * 0.6, z + bp.r * 0.6);
        count('bushes');
      } else if (k < shrubShare && solid) {
        const s = hash3(x, z, 6, 657);
        const kind: Shrub = d > 22 && s < 0.45 ? 'green' : s < 0.34 ? 'boug' : s < 0.6 ? 'hibiscus' : s < 0.86 ? 'ixora' : 'green';
        shrub(b, field, x, g, z, kind, gi, low, src);
        count('shrubs');
      } else if (k < shrubShare + flowerShare) {
        flowerPatch(b, field, x, z, gi, low, src);
        count('flowers');
      } else {
        // (tall grass out in the meadow; short where the views pass)
        grassClump(b, x, g, z, gi, d > 8 && !open, low, src);
        count('grass');
      }
    }

  // ── By the water: reeds along the sand's edge, lily pads and lotus in the shallows, either side of the ghat ──
  {
    const du = low ? 2.2 : 1.6;
    let pads = 0;
    for (let u = -50; u <= 50; u += du) {
      if (Math.abs(u) < 12) continue;
      const { water } = bankAt(u);
      const j = hash3(u, 1, 0, 659);
      // Reeds: in clumps along the edge (noise: drifts of them, gaps between).
      const drift = valueNoise3(u / 7, 1.5, 0.5, 660);
      if (drift > 0.4 && j < 0.85) {
        const v = water + (j - 0.6) * 1.6;
        const [x, z] = fr.at(u + (hash3(u, 2, 0, 659) - 0.5) * du, v);
        if (!onLakeLanding(x, z, 2.5) && !inSight(x, z, 0.5, 0.18)) {
          const ww = field.waterAt(x, z);
          const g = field.heightAt(x, z);
          // (in the water only where it is shallow: they stand on the bed)
          if (ww === null ? field.surface[field.index(x, z)] === SURFACE.sand : ww - g < 0.8) {
            reeds(b, x, g, z, 52000 + Math.round(u * 10), low, src);
            count('reeds');
          }
        }
      }
      // Lily pads and lotus a few metres out (none where the families' boats moor, on the village side by the stage).
      if (valueNoise3(u / 6, 3.5, 0.5, 661) > 0.45 && hash3(u, 3, 0, 659) < (low ? 0.45 : 0.75)) {
        const v = water - 2 - 5 * hash3(u, 4, 0, 659);
        const [x, z] = fr.at(u, v);
        if (u < -10 && v < 9) continue;
        if (onLakeLanding(x, z, 2)) continue;
        if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => wet(x + dx, z + dz))) continue;
        const wy = field.waterAt(x, z) ?? fr.water;
        lilyPad(kit, x, wy, z, 1800 + pads);
        if (hash3(u, 5, 0, 659) > 0.4) lotus(kit, x + 0.4, wy, z - 0.3, 1800 + pads, hash3(u, 6, 0, 659) > 0.65);
        if (!low && hash3(u, 7, 0, 659) > 0.5) lilyPad(kit, x - 1.2, wy, z + 0.7, 1900 + pads);
        pads++;
        count('lilies');
      }
    }
  }

  // ── The mesa over the lake trail: its rim toward the plaza dressed as a garden ──
  dressMesa(b, field, lamps, low, src, () => count('mesa'));

  const blocks = b.boxes.length - n0 + kit.count - k0;
  const ms = performance.now() - t0;
  console.info(`[map] nye lake meadow: ${blocks} blocks (${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', ')}) · ${trees.length} trees, ${placed.length} palms · fishermen ${corner ? corner.at.map((v) => v.toFixed(1)).join(', ') : 'none'} · built in ${ms.toFixed(1)} ms`);
  return { blocks, ms };
}

// ── Where ──

/** How far (m) a point lies outside the terrace's ellipse (negative inside), along its ray from the middle. */
function outOf(x: number, z: number): number {
  const dx = x - LAKE_SHORE.x;
  const dz = z - LAKE_SHORE.z;
  const r = Math.hypot(dx, dz) || 1e-6;
  const c = dx / r;
  const s = dz / r;
  return r - 1 / Math.sqrt((c * c) / (LAKE_SHORE.rx * LAKE_SHORE.rx) + (s * s) / (LAKE_SHORE.rz * LAKE_SHORE.rz));
}

/** The terrace's edge toward angle `a` (radians, from its middle). */
function edgeAt(a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const R = 1 / Math.sqrt((c * c) / (LAKE_SHORE.rx * LAKE_SHORE.rx) + (s * s) / (LAKE_SHORE.rz * LAKE_SHORE.rz));
  return [LAKE_SHORE.x + c * R, LAKE_SHORE.z + s * R];
}

/** Free ground under a crown of radius `r` (its foot and four points round it). */
function roomFor(field: HeightField, x: number, z: number, r: number): boolean {
  return [
    [0, 0],
    [r * 0.6, 0],
    [-r * 0.6, 0],
    [0, r * 0.6],
    [0, -r * 0.6],
  ].every(([dx, dz]) => field.isFree(x + dx, z + dz));
}

/** Stepping stones from `from` to `to`, bending a little on the way (`bend` m sideways). */
function stonePath(from: readonly [number, number], to: readonly [number, number], bend: number): Line {
  const [sx, sz] = from;
  const dx = to[0] - sx;
  const dz = to[1] - sz;
  const L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L;
  const nz = dx / L;
  const b = bend || 1.4;
  return [
    [sx, sz],
    [sx + dx * 0.35 + nx * b, sz + dz * 0.35 + nz * b],
    [sx + dx * 0.7 - nx * b * 0.6, sz + dz * 0.7 - nz * b * 0.6],
    [to[0], to[1]],
  ];
}

/** Flat stones every ≈ 0.85 m along a path, a little to either side, off trails' treads, water, the terrace and the landing. */
function layStones(b: VoxelBuilder, field: HeightField, p: Line, seed: number, src: SourceTrace | undefined): void {
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.1) continue;
    const n = Math.max(1, Math.round(L / 0.85));
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    for (let s = 0; s < n; s++) {
      const h = hash3(seed, i, s, 662);
      const off = (s % 2 ? 0.17 : -0.17) + (h - 0.5) * 0.12;
      const x = ax + ux * (s + 0.5) * (L / n) - uz * off;
      const z = az + uz * (s + 0.5) * (L / n) + ux * off;
      const c = field.index(x, z);
      if (c < 0 || field.trail[c] === 2 || field.waterAt(x, z) !== null || onLakeShore(x, z, 0.6) || onLakeLanding(x, z, 0.5) || field.dropAt(x, z) > 0.6) continue;
      const w = 0.5 + 0.18 * h;
      const tone = h < 0.6 ? pick(PAVER, x, z, 1, 663) : pick(LATERITE, x, z, 2, 663);
      b.box(x, field.heightAt(x, z) + 0.035, z, w, 0.07, w * (0.78 + 0.2 * hash3(seed, i, s, 664)), tone, 'mapStone', { src, ry: Math.atan2(ux, uz) + (h - 0.5) * 0.7, shade: 0.92 + 0.12 * h });
    }
    for (let s = 0; s <= n; s += 2) {
      const x = ax + ux * s * (L / n);
      const z = az + uz * s * (L / n);
      const c = field.index(x, z);
      if (c >= 0 && field.trail[c] !== 2) field.occupy(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    }
  }
}

// ── The fishermen's corner ──

/**
 * On the village side of the ghat (u ≈ −34 in the stage's frame, past the plaza's sala) where the bank's top meets the sand: two bamboo frames
 * with nets drying over their rails, fish traps stacked by them, a low rack of small fish drying on matting, and a
 * skiff pulled up on the sand below, its paddle in it (the floating village's props: village/_kit.ts). Returns where the
 * stones lead (the frames' inland side) and the way they bend, or null if the shore there is not as expected.
 */
function fishermen(
  out: VoxelBuilder,
  field: HeightField,
  fr: LakeFrame,
  bankAt: (u: number) => { bank: number; water: number },
  low: boolean,
  src: SourceTrace | undefined,
): { at: [number, number]; from: number } | null {
  // (past the plaza's west sala and the purple tree by the bank: plan.ts `LAKE_SALAS`)
  for (const u of [-34, -37, -31, -40]) {
    const { bank, water } = bankAt(u);
    if (bank - water < 1.5) continue;
    const [x, z] = fr.at(u, bank + 3.2);
    const c = field.index(x, z);
    if (c < 0 || !field.isFree(x, z) || onLakeLanding(x, z, 2) || toLine(CROWD_WAY, x, z) < 6) continue;
    // A frame along the shore: local +x along u, +z inland (toward +v).
    const F = Frame.along(x, 0, z, fr.a[0], fr.a[1]);
    const lb = new VoxelBuilder();
    const L = new Local(lb, src, 917);
    const gl = (lx: number, lz: number) => field.heightAt(F.wx(lx, lz), F.wz(lx, lz));
    // Two net frames, a little apart and turned (posts, a rail, the net hanging to the water's side).
    for (const [ox, oz, w] of (low ? [[0, 0, 4.4]] : [
      [0, 0, 4.4],
      [5.2, 1.4, 3.4],
    ]) as [number, number, number][]) {
      const y = Math.min(gl(ox - w / 2, oz), gl(ox + w / 2, oz));
      for (const s of [-1, 1]) L.box(ox + (s * w) / 2, gl(ox + (s * w) / 2, oz) + 1.05 - 0.1, oz, 0.12, 2.1, 0.12, tone(BAMBOO, L.r(ox, s, 1)), 'mapBark');
      L.box(ox, y + 2.0, oz, w + 0.3, 0.1, 0.1, tone(BAMBOO, L.r(ox, 2, 2)), 'mapBark');
      drapedNet(L, ox - w / 2 + 0.15, ox + w / 2 - 0.15, y + 1.98, oz + 0.04);
      // (and a second fold on the inland side: the net hangs over the rail)
      for (let k = 0, xx = ox - w / 2 + 0.2; xx < ox + w / 2 - 0.3; xx += 0.5, k++)
        L.span(xx, y + 1.25 + L.r(k, ox, 3) * 0.3, oz + 0.04, Math.min(ox + w / 2 - 0.15, xx + 0.5), y + 2.02, oz + 0.08, k % 2 ? 0x46624f : 0x3a5546, 'petal', 0.88);
    }
    // Fish traps stacked beside the first frame, a couple more lying by the second.
    traps(L, -3.6, gl(-3.6, 0.3), 0.3, low ? 2 : 4);
    if (!low) {
      for (const [k, [tx, tz]] of [
        [8.0, 0.9],
        [8.5, 2.0],
      ].entries())
        L.box(tx, gl(tx, tz) + 0.28, tz, 0.9, 0.55, 0.55, tone(BAMBOO, L.r(k, 9, 4)), 'mapBark');
    }
    // A rack of small fish drying in the sun: a low bamboo table, matting, rows of fish.
    if (!low) {
      const rx = 2.4;
      const rz = 3.2;
      const y = gl(rx, rz);
      for (const [dx, dz] of [
        [-0.85, -0.4],
        [0.85, -0.4],
        [-0.85, 0.4],
        [0.85, 0.4],
      ])
        L.box(rx + dx, y + 0.35, rz + dz, 0.08, 0.7, 0.08, tone(BAMBOO, L.r(dx, dz, 5)), 'mapBark');
      L.box(rx, y + 0.72, rz, 1.9, 0.05, 1.0, MATTING, 'mapBark');
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 3; j++) L.box(rx - 0.75 + i * 0.3, y + 0.765, rz - 0.3 + j * 0.3, 0.07, 0.035, 0.22, FISH[(i + j * 2) % FISH.length], 'petal');
    }
    F.place(lb, out);
    // A skiff pulled up on the sand below, bow to the land, a little askew.
    // (the first spot along the shore where the whole hull lies on dry, level sand, off the ghat)
    const turn = F.theta + 0.35;
    const hx = Math.cos(turn);
    const hz = -Math.sin(turn);
    let boat = false;
    for (const du of [1.5, 4, -1.5, 7, -4]) {
      for (let sv = water + 0.6; sv <= bank + 0.5 && !boat; sv += 0.5) {
        const [bx, bz] = fr.at(u + du, sv);
        const g = field.heightAt(bx, bz);
        const ok = [0, 2.1, -2.1].every((t) => {
          const px = bx + hx * t;
          const pz = bz + hz * t;
          const pc = field.index(px, pz);
          return pc >= 0 && field.waterAt(px, pz) === null && field.surface[pc] === SURFACE.sand && Math.abs(field.heightAt(px, pz) - g) < 0.3 && !onLakeLanding(px, pz, 1);
        });
        if (!ok) continue;
        const B = new Frame(bx, 0, bz, turn);
        const sb = new VoxelBuilder();
        skiff(new Local(sb, src, 918), 0, g + 0.15, 0, 4.2, 7);
        B.place(sb, out);
        field.occupy(bx - 2.2, bz - 2.2, bx + 2.2, bz + 2.2);
        boat = true;
      }
      if (boat) break;
    }
    if (!boat) console.warn('[map] nye lake meadow: no dry sand for the fishermen\'s skiff');
    // (the corner's ground: nothing else grows there)
    for (let du = -5; du <= 9; du += 1)
      for (let dv = 0.5; dv <= 4.5; dv += 1) {
        const [ox, oz] = fr.at(u + du, bank + dv);
        field.occupy(ox - 0.6, oz - 0.6, ox + 0.6, oz + 0.6);
      }
    const [tx, tz] = fr.at(u + 2, bank + 6.2);
    return { at: [tx, tz], from: -1.6 };
  }
  return null;
}

// ── The mesa ──

/** The two views over the plaza from its gate side (l-over, l-ref: map x, z): nothing tall within this of them (m). */
const OVER_CAMS: readonly (readonly [number, number])[] = [
  [-312, -104],
  [-324, -88],
];
const CAM_CLEAR = 13;
/** And within this, only low things (the cameras float a few metres over the mesa: a bush there is a wall of cubes). */
const CAM_LOW = 22;

/**
 * The mesa north of the plaza (the land's: its top ≈ 22 m over the plaza, a sheer face just behind the lake trail) fills
 * the right of the views over the plaza (the owner's free camera floats over its top): its rim toward the plaza dressed
 * as the venue's garden — bougainvillea and flowering bushes, palms (none near those cameras), flower patches, Khmer
 * lamps along the edge, and bougainvillea cascading down the face. The rim: within 10 m of where the land drops 6 m or
 * more on the way to the plaza's middle, on flat top. In the shore's builder (leaf and petal soft, the lamps stone).
 */
function dressMesa(b: VoxelBuilder, field: HeightField, lamps: Lamps | null, low: boolean, src: SourceTrace | undefined, done: () => void): void {
  const { x: cx, z: cz } = LAKE_SHORE;
  const bushes = bushProtos(low);
  const palms: Proto[] = [0, 1, 2].map((i) => palmProto({ s: 1, h: 8 + i * 1.4, seed: 31 + i * 3 + (i === 2 ? 0 : 1) }));
  const lampsAt: [number, number][] = [];
  const palmsAt: [number, number][] = [];
  const step = low ? 2.4 : 1.7;
  // (the mesa's side toward the plaza: north-west through north-east of it, 22‥60 m out)
  for (let r = 22; r <= 62; r += step)
    for (let a = 100; a <= 200; a += (step / r) * (180 / Math.PI)) {
      const [x0, z0] = lakePlazaAt((a * Math.PI) / 180, r);
      const x = x0 + (hash3(r, a, 1, 671) - 0.5) * step;
      const z = z0 + (hash3(r, a, 2, 671) - 0.5) * step;
      const g = field.heightAt(x, z);
      if (g < 16) continue;
      // (the way down to the plaza: where the face is, how far)
      const d = Math.hypot(cx - x, cz - z);
      const dx = (cx - x) / d;
      const dz = (cz - z) / d;
      let face = -1;
      for (let k = 0.5; k <= 10; k += 0.5)
        if (field.heightAt(x + dx * k, z + dz * k) < g - 6) {
          face = k;
          break;
        }
      if (face < 0) continue;
      const c = field.index(x, z);
      if (c < 0 || field.trail[c] === 2 || field.occupied[c] || field.waterAt(x, z) !== null) continue;
      if ([[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].some(([ox, oz]) => Math.abs(field.heightAt(x + ox, z + oz) - g) > 0.1)) continue;
      // (under those cameras only what stays low: flowers, small shrubs; bushes and palms farther along the rim)
      const camD = Math.min(...OVER_CAMS.map(([qx, qz]) => Math.hypot(qx - x, qz - z)));
      const nearCam = camD < CAM_CLEAR;
      const lowOnly = camD < CAM_LOW;
      const h = hash3(x, z, 3, 671);
      // On the very edge: a lamp now and then, else bougainvillea spilling down the face.
      if (face <= 2) {
        if (!low && !nearCam && lampsAt.every(([lx, lz]) => Math.hypot(lx - x, lz - z) > 9)) {
          khmerLamp(b, x, g, z, 1.2, 690 + lampsAt.length, src, lamps, null, 2.2);
          lampsAt.push([x, z]);
          field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
        } else if (h < 0.55) cascade(b, field, x, z, g, dx, dz, face, Math.round(h * 997), low, src);
        continue;
      }
      if (!lowOnly && h < 0.09 && palmsAt.every(([px, pz]) => Math.hypot(px - x, pz - z) > 7)) {
        stamp(b, field, palms[Math.floor(hash3(x, z, 4, 671) * palms.length)], x, g, z, 6000 + palmsAt.length, null);
        palmsAt.push([x, z]);
        field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
      } else if (h < 0.42) {
        const kind: Shrub = h < 0.25 ? 'boug' : h < 0.34 ? 'hibiscus' : 'ixora';
        shrub(b, field, x, g, z, kind, Math.round(h * 9973) + 7000, low, src);
      } else if (h < 0.62 && !lowOnly && field.isFree(x, z)) {
        const bp = bushes[Math.floor(hash3(x, z, 5, 671) * bushes.length)];
        const tones = h < 0.52 ? BOUG : BOUG_PURPLE;
        const gi = Math.round(h * 7919);
        stamp(b, field, bp, x, g, z, gi, (color, ci) => (BUSH_LIT.has(color) && hash3(ci, gi, 1, 672) < 0.5 ? tones[ci % tones.length] : color));
        field.occupy(x - bp.r * 0.6, z - bp.r * 0.6, x + bp.r * 0.6, z + bp.r * 0.6);
      } else if (h < 0.8) flowerPatch(b, field, x, z, Math.round(h * 4241) + 7100, low, src);
      done();
    }
  done();
}

/** Bougainvillea hanging from the mesa's edge down its face (toward (dx, dz), the face `face` m out): a curtain of bracts and leaves. */
function cascade(b: VoxelBuilder, field: HeightField, x: number, z: number, g: number, dx: number, dz: number, face: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  // (where exactly the land drops, to a tenth of a metre)
  let f = face - 0.5;
  while (f < face && field.heightAt(x + dx * (f + 0.1), z + dz * (f + 0.1)) > g - 1) f += 0.1;
  const fx = x + dx * (f + 0.18);
  const fz = z + dz * (f + 0.18);
  const ry = Math.atan2(dx, dz);
  const len = 3 + 6 * hash3(seed, 1, 1, 673);
  const cell = low ? 0.7 : 0.48;
  for (let k = 0; k * cell < len; k++) {
    for (const side of low ? [0] : [-0.5, 0.5]) {
      const r = hash3(seed, k, side, 674);
      if (r < 0.18 + (k * cell) / len / 2) continue;
      const leafy = r < 0.42;
      const sx = fx + Math.cos(ry) * side * cell;
      const sz = fz - Math.sin(ry) * side * cell;
      b.box(sx, g - 0.1 - k * cell, sz, cell, cell, cell * 0.8, leafy ? 0x3f6e2e : BOUG[Math.floor(r * 997) % BOUG.length], leafy ? 'mapLeaf' : 'petal', { src, ry, shade: 0.88 + 0.16 * r });
    }
  }
}
