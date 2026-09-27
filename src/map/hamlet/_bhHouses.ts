import { Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { beamWorld } from '../jungle/_campKit';
import { Frame } from '../landmarks/_prasatKit';
import { houseBody, WALL_H } from '../village/_house';
import { BAMBOO, DECK, gableEnd, gableRoof, hen, jar, khmerHat, laundry, Local, mat, moto, POST, potPlant, RIDGE, ROOFS, roofUnder, stove, tone, traps, TRIM, type GlowFn, type Roof, type Tones } from '../village/_kit';
import type { SmokeSource } from '../village/_smoke';
import { GRANARY, homeFront, loomSpot, STEP, stiltGrid, type BackHome } from './_bhSpots';

/**
 * The houses of the hamlet behind Angkor Wat: Khmer country houses of
 * boards on tall stilts (room to stand, rest and work in the shade under
 * the floor), each with its veranda and a stair down to the yard, built with
 * the floating village's house body (village/_house.ts: plank walls,
 * windows with open shutters, the stepped roof of palm thatch or tin, the
 * veranda's railing, a lantern) on posts set on footing stones. Under them:
 * a slatted bamboo bed, a moto, the hen coop, the weaver's loom. In the
 * yard by each: the kitchen fire (a clay stove, firewood, its smoke). And
 * the rice granary: a small store of woven bamboo on posts with rat guards.
 *
 * Built in each home's frame (village/_kit.ts `Local`: metres, y the world
 * height), then turned into place. Tin, the lantern's frame and the moto
 * are made of the stone family (one voxel family fewer to draw).
 */

/** What a house build writes into: the hamlet's blocks, its glows (map points) and its kitchen smoke. */
export interface BuildEnv {
  field: HeightField;
  world: VoxelBuilder;
  /** A glowing box at a map point: centre, size (across, up, along), turn about y, colour; `halo` (m) round a lamp. */
  glow(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number, halo?: number): void;
  smoke: SmokeSource[];
}

/** Footing stones and concrete pads under the posts. */
const FOOTING = [0x9a9286, 0x8c857a, 0xa69e90, 0x807a70];
/**
 * Half the front stair's width (m): wide enough for the roaming explorer (1.4 × his size, roam/walker.ts) to
 * come up it and onto the veranda through the railing's opening (the walk map's 0.5 m columns take its
 * rails and posts whole: roam/walkmap.ts).
 */
const STAIR_HALF = 0.9;
/** A krama and silk in the loom: red and white checks, the warp's colours. */
const WARP = [0xb8322c, 0xf0ece0, 0x2c5a9a, 0xe0a030, 0xb8322c, 0x3a7a4a];

/** A glow function for boxes built in the frame `fr`. */
function frameGlow(env: BuildEnv, fr: Frame): GlowFn {
  return (x, y, z, sx, sy, sz, color, halo) => env.glow(fr.wx(x, z), y, fr.wz(x, z), sx, sy, sz, fr.theta, color, halo);
}

/** One house round the yard (see the file's comment). */
export function backHouse(h: BackHome, env: BuildEnv): void {
  const src = traceSource();
  const fr = new Frame(h.x, 0, h.z, h.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, h.seed * 131 + 17);
  const W = h.w;
  const { zf, zb, zw, steps } = homeFront(h);
  const G = env.field.heightAt(h.x, h.z);
  const F = G + h.lift;
  const ground = (x: number, z: number) => env.field.heightAt(fr.wx(x, z), fr.wz(x, z));
  const glow = frameGlow(env, fr);
  const trim = TRIM[h.walls];
  const { xs, zs } = stiltGrid(h);

  // ── Stilts on footing stones, bearers, the floor ──────────────────────────
  xs.forEach((x, i) =>
    zs.forEach((z, j) => {
      const g = ground(x, z);
      L.span(x - 0.15, g - 0.4, z - 0.15, x + 0.15, F - 0.45, z + 0.15, tone(POST, L.r(i, j, 1)), 'mapBark');
      L.box(x, g + 0.06, z, 0.44, 0.14, 0.44, tone(FOOTING, L.r(i, j, 2)), 'mapStone');
    }),
  );
  for (const z of zs) L.span(-W / 2, F - 0.45, z - 0.17, W / 2, F - 0.2, z + 0.17, tone(POST, L.r(z, 2)), 'mapBark', 0.9);
  for (let x = -W / 2, i = 0; x < W / 2 - 0.05; x += 0.5, i++) L.span(x, F - 0.2, zb, Math.min(W / 2, x + 0.5), F, zf, tone(DECK, L.r(i, 3)), 'mapBark', 0.95 + L.r(i, 4) * 0.08);

  const body = { w: W, d: h.d, v: h.v, floor: F, roof: h.roof, walls: h.walls, lit: true, gap: h.stair, gapHalf: STAIR_HALF + 0.4 };
  const roof = houseBody(L, body, glow);
  // The Khmer gable: a fan of boards on both gable ends; the old house's skirt roof along its sides.
  const top = F + WALL_H;
  for (const side of [-1, 1]) gableFan(env.world, fr, side * (W / 2 + 0.02), top, zb, zf, roof, tone(trim, 0.3), src);
  if (h.under === 'hammock') skirt(L, W, roof, F, h.roof);
  if (h.porch) porch(L, env, fr, h, F, ground, trim, src);

  // ── The front stair down to the yard ──────────────────────────────────────
  const sx0 = h.stair - STAIR_HALF;
  const sx1 = h.stair + STAIR_HALF;
  for (let i = 1; i < steps; i++) {
    const z = zf + (i - 1) * STEP;
    const y = F - i * STEP;
    L.span(sx0, y - 0.14, z, sx1, y, z + STEP, tone(DECK, L.r(i, 7)), 'mapBark');
    // (the handrails just outside the treads, from the second step down: a rail on the top step, under the eaves, would
    // stop the roaming explorer coming down; the veranda's railing stops 0.4 m wide of the treads: as the floating
    // village's stilt houses, village/_houses.ts)
    for (const [x, o] of [
      [sx0, sx0 - 0.12],
      [sx1 - 0.12, sx1 + 0.02],
    ]) {
      L.span(x, y - 0.42, z, x + 0.12, y - 0.14, z + STEP, tone(POST, 0.3), 'mapBark', 0.9);
      if (i === 1) continue;
      L.span(o, y + 0.85, z, o + 0.1, y + 0.95, z + STEP, tone(trim, 0.2), 'mapBark');
      if (i % 2 === 0 || i === steps - 1) L.span(o, y, z + 0.2, o + 0.1, y + 0.9, z + 0.28, tone(trim, 0.6), 'mapBark');
    }
  }
  // Sandals left at the stair's foot, a jar of water to wash the feet.
  const footZ = zf + (steps - 1) * STEP;
  L.box(h.stair - 0.25, G + 0.02, footZ + 0.35, 0.12, 0.03, 0.26, 0x3a3a3a, 'petal');
  L.box(h.stair - 0.05, G + 0.02, footZ + 0.4, 0.12, 0.03, 0.26, 0xc04a3a, 'petal');
  jar(L, h.stair + (h.stair > 0 ? -1.1 : 1.1), G, footZ - 0.4, 0.8);

  // ── A small deck at the back door (the pond side) ─────────────────────────
  if (h.deck) {
    const dx0 = -W / 2 + 0.2;
    const dx1 = -W / 2 + 2.6;
    const dz = zb - 1.3;
    for (let x = dx0, i = 0; x < dx1 - 0.05; x += 0.5, i++) L.span(x, F - 0.2, dz, Math.min(dx1, x + 0.5), F, zb, tone(DECK, L.r(i, 21)), 'mapBark');
    for (const x of [dx0 + 0.15, dx1 - 0.15]) L.span(x - 0.12, ground(x, dz + 0.15) - 0.4, dz + 0.03, x + 0.12, F - 0.2, dz + 0.27, tone(POST, L.r(x, 6)), 'mapBark');
    L.span(dx0, F + 0.85, dz, dx1, F + 0.95, dz + 0.08, tone(trim, 0.2), 'mapBark');
    for (let x = dx0 + 0.15; x < dx1 - 0.05; x += 0.55) L.span(x, F, dz, x + 0.08, F + 0.85, dz + 0.08, tone(trim, 0.7), 'mapBark');
    L.span(dx1 - 0.08, F + 0.85, dz, dx1, F + 0.95, zb, tone(trim, 0.2), 'mapBark');
    // (the children's things drying over the deck: kramas, shorts)
    laundry(L, dx0 + 0.1, dz + 0.3, dx1 - 0.2, dz + 0.3, F + 2.1);
    potPlant(L, dx0 + 0.45, F, dz + 0.45);
  }

  // ── Life on the veranda ───────────────────────────────────────────────────
  if (h.seed % 4 === 3) khmerHat(L, -1.0, F + 1.75, zw);
  if (h.under === 'moto') mat(L, -W / 2 + 1.3, F, (zw + zf) / 2);

  // ── In the shade under the floor ──────────────────────────────────────────
  const inner = zs[zs.length - 2];
  if (h.under === 'hammock') {
    // A slatted bamboo bed (for a nap, for the evening), a mat on it; firewood against the back posts.
    bambooBed(L, -W / 2 + 1.4, G, inner - 0.2);
    for (let k = 0; k < 4; k++) L.span(xs[1] - 0.9, G + k * 0.17, zs[0] + 0.25, xs[1] + 0.9, G + k * 0.17 + 0.17, zs[0] + 0.8 - k * 0.04, tone([0x7a5a3a, 0x6a4a30, 0x8a6a48], L.r(k, 13)), 'mapBark');
    jar(L, xs[xs.length - 1] - 0.45, G, zs[0] + 0.5);
  } else if (h.under === 'loom') loom(L, h, G);
  else if (h.under === 'moto') {
    moto(L, -0.4, G, inner + 0.3, tone([0xb8322a, 0x2a3a8a, 0x1a1a1a], L.r(h.seed, 15)));
    traps(L, W / 2 - 1.2, G, zs[0] + 0.5, 3);
    jar(L, -W / 2 + 0.6, G, zs[0] + 0.6);
    jar(L, -W / 2 + 1.4, G, zs[0] + 0.55, 0.85);
  } else {
    coop(L, xs[1], G, zs[1] + 0.2);
    for (let k = 0; k < 4; k++) hen(L, xs[1] - 0.6 + k * 0.7, G, zf + 1.4 + L.r(k, 16) * 1.3, k === 0, k % 2 === 1);
    for (let k = 0; k < 3; k++) L.span(xs[2] - 0.8, G + k * 0.17, zs[0] + 0.3, xs[2] + 0.8, G + k * 0.17 + 0.17, zs[0] + 0.85 - k * 0.04, tone([0x7a5a3a, 0x6a4a30, 0x8a6a48], L.r(k, 14)), 'mapBark');
  }

  // ── The kitchen fire in the yard: a clay stove, firewood, its smoke ───────
  if (h.fire) {
    const [kx, kz] = h.fire;
    const g = ground(kx, kz);
    const top = stove(L, kx, g, kz);
    env.smoke.push({ x: fr.wx(kx, kz), y: top, z: fr.wz(kx, kz) });
    glow(kx, g + 0.28, kz + 0.29, 0.22, 0.14, 0.04, 0xff5a1c);
    for (let k = 0; k < 3; k++) L.span(kx + 0.6, g + k * 0.18, kz - 0.9 + k * 0.05, kx + 1.7, g + k * 0.18 + 0.18, kz - 0.25 - k * 0.05, tone([0x7a5a3a, 0x6a4a30, 0x8a6a48], L.r(k, 13)), 'mapBark');
    // A pot and a basket by it.
    L.box(kx - 0.55, g + 0.13, kz + 0.25, 0.32, 0.26, 0.32, 0x2a2420, 'mapStone');
    L.box(kx - 0.5, g + 0.12, kz - 0.5, 0.42, 0.24, 0.42, tone(BAMBOO, L.r(kx, 17)), 'mapBark');
  }
  // (old clay tiles instead of its tin: the roof and the skirt, a darker ridge)
  if (h.tile) {
    const tin = new Set<number>(ROOFS[h.roof]);
    lb.boxes.forEach((b, i) => {
      if (b.mat !== 'metal') return;
      if (b.color === RIDGE[h.roof]) b.color = TILE_RIDGE;
      else if (tin.has(b.color)) b.color = tone(TILE, L.r(i, 71));
    });
  }
  // (one voxel family fewer: tin, the lantern's frame, the moto)
  for (const b of lb.boxes) if (b.mat === 'metal') b.mat = 'mapStone';
  fr.place(lb, env.world);
}

/** Old clay roof tiles, some darker with age and lichen (as the sala's), and the ridge's. */
const TILE = [0xa85a3a, 0xb8663f, 0x9a5234, 0xb06040, 0x8e5a40, 0xa4583a];
const TILE_RIDGE = 0x7a3e28;

/**
 * The phteah pet's porch: a little gabled roof over the head of the front
 * stair, its ridge running out from the house, its gable (planks and a fan
 * of boards, as the house's) looking to the yard, on two posts standing
 * either side of the stair, a beam across under the gable. Built in a
 * frame turned a quarter from the house's (its x along the house's +z).
 */
function porch(L: Local, env: BuildEnv, fr: Frame, h: BackHome, F: number, ground: (x: number, z: number) => number, trim: Tones, src: SourceTrace | undefined): void {
  const { zf } = homeFront(h);
  const Lp = 2.2;
  const Wp = STAIR_HALF * 2 + 0.7;
  const zc = zf + Lp / 2 - 0.2;
  const pf = new Frame(h.stair, 0, zc, -Math.PI / 2);
  const pb = new VoxelBuilder();
  const P = new Local(pb, src, h.seed * 17 + 3);
  const thatch = h.roof === 'thatch';
  const run = 0.42;
  const rise = thatch ? 0.46 : 0.36;
  const eave = F + 2.42;
  const rp: Roof = { x0: -Lp / 2, x1: Lp / 2 + 0.2, z0: -Wp / 2 - 0.35, z1: Wp / 2 + 0.35, eave, run, rise };
  gableRoof(P, rp, ROOFS[h.roof], RIDGE[h.roof], thatch ? 'mapBark' : 'metal', 1.0);
  gableEnd(P, rp, Lp / 2 - 0.06, 0.12, -Wp / 2, Wp / 2, eave + rise, [0x8a6a48, 0x7d5f40, 0x947354]);
  pf.place(pb, L.b);
  // The two posts either side of the stair, the beam across under the gable.
  const pz = zc + Lp / 2 - 0.15;
  for (const s of [-1, 1]) {
    const x = h.stair + s * (Wp / 2 - 0.05);
    L.span(x - 0.1, ground(x, pz) - 0.2, pz - 0.1, x + 0.1, eave + 0.05, pz + 0.1, tone(POST, L.r(s, 72)), 'mapBark');
    L.box(x, ground(x, pz) + 0.06, pz, 0.4, 0.12, 0.4, tone(FOOTING, L.r(s, 73)), 'mapStone');
  }
  L.span(h.stair - Wp / 2 - 0.1, eave - 0.1, pz - 0.1, h.stair + Wp / 2 + 0.1, eave + 0.08, pz + 0.1, tone(trim, 0.3), 'mapBark');
  // (the fan of boards in its gable, on the map: the porch's frame there)
  const mf = new Frame(fr.wx(h.stair, zc), 0, fr.wz(h.stair, zc), fr.theta - Math.PI / 2);
  gableFan(env.world, mf, Lp / 2 + 0.02, eave + rise, -Wp / 2, Wp / 2, rp, tone(trim, 0.3), src);
}

const _a = new Vector3();
const _b = new Vector3();

/**
 * A fan of boards in a gable end, as Khmer country houses have: rays from
 * the middle of the gable's foot (local height `y0`, between the depths
 * `za` and `zb`) up to the underside of the roof `r`, on the gable's face at
 * local x = `at` of the frame `fr` (map-space blocks: the rays lean).
 */
export function gableFan(world: VoxelBuilder, fr: Frame, at: number, y0: number, za: number, zb: number, r: Roof, color: number, src: SourceTrace | undefined): void {
  const mid = (r.z0 + r.z1) / 2;
  const n = 7;
  _a.set(fr.wx(at, mid), y0 + 0.06, fr.wz(at, mid));
  for (let k = 0; k < n; k++) {
    const z = za + 0.25 + ((zb - za - 0.5) * k) / (n - 1);
    const y = roofUnder(r, z) - 0.06;
    if (y < y0 + 0.3) continue;
    _b.set(fr.wx(at, z), y, fr.wz(at, z));
    beamWorld(world, _a, _b, 0.05, 0.07, color, 'mapBark', 0, 0.95, src);
  }
  // (a board along the foot of the gable, the rays' base)
  _a.set(fr.wx(at, za + 0.1), y0 + 0.04, fr.wz(at, za + 0.1));
  _b.set(fr.wx(at, zb - 0.1), y0 + 0.04, fr.wz(at, zb - 0.1));
  beamWorld(world, _a, _b, 0.06, 0.08, color, 'mapBark', 0, 0.9, src);
}

/** A lower skirt of roof along both sides of a house, under its main gable (the Khmer phteah kantaing). */
function skirt(L: Local, W: number, r: Roof, F: number, kind: BackHome['roof']): void {
  const tones = ROOFS[kind];
  const y = F + 2.35;
  for (const side of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const x0 = side * (W / 2 + k * 0.5);
      const x1 = side * (W / 2 + 0.6 + k * 0.5);
      for (let z = r.z0 + 0.5, i = 0; z < r.z1 - 0.55; z += 1.3, i++) L.span(Math.min(x0, x1), y - k * 0.2, z, Math.max(x0, x1), y - k * 0.2 + 0.12, Math.min(r.z1 - 0.5, z + 1.3), tone(tones, L.r(i, k, side + 60)), kind === 'thatch' ? 'mapBark' : 'metal', 0.92 - k * 0.04);
    }
}

/** A slatted bamboo bed (a kre) on four legs at (x, y, z), a woven mat on it. */
function bambooBed(L: Local, x: number, y: number, z: number): void {
  for (const [dx, dz] of [
    [-0.85, -0.55],
    [0.85, -0.55],
    [-0.85, 0.55],
    [0.85, 0.55],
  ])
    L.box(x + dx, y + 0.22, z + dz, 0.1, 0.44, 0.1, tone(BAMBOO, 0.2), 'mapBark');
  for (let k = 0; k < 5; k++) L.box(x, y + 0.47, z - 0.5 + k * 0.25, 1.9, 0.06, 0.2, tone(BAMBOO, L.r(k, x, 41)), 'mapBark');
  L.box(x - 0.2, y + 0.515, z, 1.2, 0.03, 1.0, 0x3a7a5a, 'petal');
  L.box(x - 0.2, y + 0.53, z, 1.2, 0.02, 0.12, 0xb8423a, 'petal');
}

/** A bamboo hen coop (a slatted cage on legs) at (x, y, z). */
function coop(L: Local, x: number, y: number, z: number): void {
  for (const [dx, dz] of [
    [-0.6, -0.4],
    [0.6, -0.4],
    [-0.6, 0.4],
    [0.6, 0.4],
  ])
    L.box(x + dx, y + 0.5, z + dz, 0.08, 1.0, 0.08, tone(BAMBOO, 0.4), 'mapBark');
  L.box(x, y + 0.3, z, 1.3, 0.06, 0.9, tone(BAMBOO, 0.6), 'mapBark');
  L.box(x, y + 1.02, z, 1.4, 0.06, 1.0, tone(BAMBOO, 0.3), 'mapBark');
  for (let k = 0; k < 6; k++) L.box(x - 0.5 + k * 0.2, y + 0.66, z + 0.42, 0.05, 0.66, 0.05, tone(BAMBOO, L.r(k, x, 42)), 'mapBark');
  for (let k = 0; k < 6; k++) L.box(x - 0.5 + k * 0.2, y + 0.66, z - 0.42, 0.05, 0.66, 0.05, tone(BAMBOO, L.r(k, z, 43)), 'mapBark');
}

/** The weaver's floor loom under her house (see `loomSpot`): frame, beams, the warp in bright threads, the cloth on its roll, her bench. */
function loom(L: Local, h: BackHome, G: number): void {
  const s = loomSpot(h);
  const wood = 0x6e5236;
  const hx = 0.72;
  const z0 = s.breast - 0.15;
  const z1 = s.back;
  for (const x of [-hx, hx]) {
    L.span(x - 0.05, G, z0 - 0.05, x + 0.05, G + 1.35, z0 + 0.05, wood, 'mapBark');
    L.span(x - 0.05, G, z1 - 0.05, x + 0.05, G + 1.35, z1 + 0.05, wood, 'mapBark');
    L.span(x - 0.04, G + 1.3, z0, x + 0.04, G + 1.38, z1, wood, 'mapBark', 0.95);
    L.span(x - 0.04, G + 0.3, z0, x + 0.04, G + 0.36, z1, wood, 'mapBark', 0.9);
  }
  // Breast beam, the cloth rolled under it, the back beam; the warp between them in coloured threads.
  L.span(-hx, G + 0.7, s.breast - 0.05, hx, G + 0.78, s.breast + 0.05, 0x8a6a48, 'mapBark');
  L.span(-hx + 0.08, G + 0.5, s.breast - 0.06, hx - 0.08, G + 0.64, s.breast + 0.08, 0xb8322c, 'petal');
  L.span(-hx + 0.08, G + 0.55, s.breast - 0.07, hx - 0.08, G + 0.58, s.breast + 0.09, 0xf0ece0, 'petal');
  L.span(-hx, G + 0.84, z1 - 0.06, hx, G + 0.92, z1 + 0.06, 0x8a6a48, 'mapBark');
  for (let k = 0; k < 6; k++) {
    const x = -0.55 + k * 0.22;
    L.span(x - 0.1, G + 0.79, s.breast + 0.06, x + 0.1, G + 0.81, z1 - 0.06, WARP[k], 'petal');
  }
  // The beater hanging from the top rails, the heddles, two treadles.
  const zb = s.z + 0.12;
  L.span(-hx + 0.05, G + 0.86, zb - 0.03, hx - 0.05, G + 0.94, zb + 0.03, wood, 'mapBark');
  for (const x of [-hx + 0.08, hx - 0.08]) L.span(x - 0.025, G + 0.86, zb - 0.025, x + 0.025, G + 1.3, zb + 0.025, wood, 'mapBark');
  L.span(-hx + 0.05, G + 1.02, zb + 0.28, hx - 0.05, G + 1.06, zb + 0.32, wood, 'mapBark');
  for (const x of [-0.2, 0.2]) L.span(x - 0.06, G + 0.04, s.breast + 0.1, x + 0.06, G + 0.08, z1 - 0.3, 0x5a4230, 'mapBark');
  // Her bench, a basket of spools by it.
  const [bx, bz] = s.seat;
  L.span(bx - 0.45, G + 0.4, bz - 0.14, bx + 0.45, G + 0.46, bz + 0.14, 0x7a5a3a, 'mapBark');
  for (const x of [-0.38, 0.38]) L.span(bx + x - 0.04, G, bz - 0.1, bx + x + 0.04, G + 0.4, bz + 0.1, 0x6a4a30, 'mapBark');
  L.box(bx + 0.95, G + 0.14, bz + 0.1, 0.4, 0.28, 0.4, tone(BAMBOO, 0.7), 'mapBark');
  for (let k = 0; k < 3; k++) L.box(bx + 0.87 + (k % 2) * 0.16, G + 0.32, bz + 0.02 + k * 0.08, 0.1, 0.1, 0.1, WARP[k + 1], 'petal');
}

/** The rice granary: a small store of woven bamboo on posts with rat guards, a thatched gable roof, a ladder to its little door. */
export function granary(env: BuildEnv): void {
  const src = traceSource();
  const g = GRANARY;
  const fr = new Frame(g.x, 0, g.z, g.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 523);
  const G = env.field.heightAt(g.x, g.z);
  const F = G + g.lift;
  const hw = g.w / 2;
  const hd = g.d / 2;
  for (const x of [-hw + 0.15, hw - 0.15])
    for (const z of [-hd + 0.15, hd - 0.15]) {
      L.span(x - 0.12, G - 0.3, z - 0.12, x + 0.12, F - 0.1, z + 0.12, tone(POST, L.r(x, z, 1)), 'mapBark');
      // (a flat stone guard on each post: rats cannot climb past it)
      L.box(x, F - 0.45, z, 0.5, 0.05, 0.5, 0x8a857c, 'mapStone');
    }
  L.span(-hw, F - 0.1, -hd, hw, F + 0.05, hd, tone(DECK, 0.4), 'mapBark');
  // Woven bamboo walls: a checker of two tones.
  const top = F + 1.5;
  for (let j = 0; j < 4; j++) {
    const y0 = F + 0.05 + j * 0.36;
    const y1 = Math.min(top, y0 + 0.36);
    for (let i = 0; i < 6; i++) {
      const a = -hw + (i * g.w) / 6;
      const b = a + g.w / 6;
      const c = (i + j) % 2 ? tone(BAMBOO, 0.2) : tone(BAMBOO, 0.8);
      // (the little door in the front wall, over the ladder)
      if (!(i >= 2 && i <= 3 && j <= 2)) L.span(a, y0, hd - 0.1, b, y1, hd, c, 'mapBark');
      L.span(a, y0, -hd, b, y1, -hd + 0.1, c, 'mapBark', 0.95);
    }
    for (const x of [-hw, hw - 0.1])
      for (let i = 0; i < 5; i++) {
        const a = -hd + 0.1 + (i * (g.d - 0.2)) / 5;
        L.span(x, y0, a, x + 0.1, y1, a + (g.d - 0.2) / 5, (i + j) % 2 ? tone(BAMBOO, 0.3) : tone(BAMBOO, 0.9), 'mapBark', 0.97);
      }
  }
  L.span(-g.w / 6, F + 0.05, hd - 0.14, g.w / 6, F + 1.1, hd - 0.1, 0x2a2119, 'mapBark', 0.8);
  // The roof: palm thatch, stepped, ridge along x.
  const r = { x0: -hw - 0.4, x1: hw + 0.4, z0: -hd - 0.45, z1: hd + 0.45, eave: top - 0.15, run: 0.42, rise: 0.46 };
  gableRoof(L, r, ROOFS.thatch, RIDGE.thatch, 'mapBark', 1.4);
  for (const x of [-hw, hw - 0.1]) {
    for (let k = 0; k < 4; k++) {
      const a = r.z0 + (k + 1) * r.run;
      const b = r.z1 - (k + 1) * r.run;
      if (b - a < 0.2) continue;
      L.span(x, r.eave + k * r.rise, a, x + 0.1, r.eave + (k + 1) * r.rise, b, tone(BAMBOO, 0.5), 'mapBark', 0.92);
    }
  }
  // A bamboo ladder up to the door.
  for (const s of [-0.28, 0.28]) L.span(s - 0.04, G, hd + 0.55, s + 0.04, F + 0.3, hd + 0.62, tone(BAMBOO, 0.5), 'mapBark');
  for (let y = G + 0.35; y < F; y += 0.35) L.span(-0.28, y - 0.03, hd + 0.52, 0.28, y + 0.03, hd + 0.6, tone(BAMBOO, 0.7), 'mapBark');
  // Baskets of paddy and a winnowing tray below it.
  L.box(hw + 0.5, G + 0.2, 0.2, 0.5, 0.4, 0.5, tone(BAMBOO, 0.1), 'mapBark');
  L.box(hw + 0.5, G + 0.43, 0.2, 0.4, 0.06, 0.4, 0xd8b860, 'petal');
  L.box(-hw - 0.4, G + 0.5, -0.2, 0.05, 0.9, 0.9, tone(BAMBOO, 0.6), 'mapBark');
  fr.place(lb, env.world);
}
