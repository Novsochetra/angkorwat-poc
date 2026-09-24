import { AdditiveBlending, BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial, Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';

/**
 * The boat, its paddle and its mooring, as voxels at true size (metres):
 * a narrow Khmer dugout about 3.2 m long and 0.9 m wide, low in the water,
 * its ends gently upturned, the bow post curling up with a small lantern
 * hanging in front. Teak outside with a red band and a cream line under the
 * gunwale, dark planks inside, two thwarts. The roaming code scales it with
 * the explorer (`body.scale`).
 *
 * Boat space: origin on the waterline in the middle, +z towards the bow,
 * +x to the left (port), like the explorer's own space.
 */

/** Teak of the hull, the lighter gunwale cap, the dark planks inside (sRGB). */
const TEAK = [0x8f532b, 0x9a5b2e, 0x844a25, 0xa3653a];
const CAP = [0xc08652, 0xb57a47, 0xc9925e];
const PLANK = [0x5c3419, 0x66391c, 0x523017, 0x6e4222];
/** The painted band and the thin line under it. */
const RED = [0xa8352a, 0xb23c2e, 0x9c2f26];
const CREAM = [0xe6d6b0, 0xdccba2];
const BRASS = 0xc59a4a;
const ROPE = [0xc9ab78, 0xb99a68];

/** Hull length and half width (m). */
export const BOAT_LENGTH = 3.2;
export const BOAT_HALF_BEAM = 0.45;
/** Top of the seat (the rear thwart) and its middle along the boat (m, boat space). */
export const SEAT = new Vector3(0, 0.15, -0.3);
/** Middle of the lantern glass (m, boat space). */
export const LANTERN = new Vector3(0, 0.64, 1.75);

const pick = (list: readonly number[], i: number, j: number, k: number, seed: number) => list[Math.floor(hash3(i, j, k, seed) * list.length)];

/** Hull outer half width at a point along the boat (e = |z| / half length, 0‥1). */
const halfWidth = (e: number) => BOAT_HALF_BEAM * Math.sqrt(Math.max(0, 1 - Math.pow(e, 2.4)));
/** Height of the gunwale (sheer line) above the waterline (m). */
const sheer = (e: number) => 0.25 + 0.3 * Math.pow(e, 2.5);

export interface BoatModel {
  /** The hull with its stem posts, thwarts and lantern frame (voxels). */
  object: Group;
  /** The lantern's glass (a glow box; its material is shared, see `lanternMaterial`). */
  glass: Mesh;
  blocks: number;
}

/** The glow of the lanterns: unlit, its colour scaled above 1 at night (bloom). */
export function lanternMaterial(): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: 0xffb35c, fog: true });
  m.name = 'boat:lantern';
  return m;
}

/**
 * The lanterns' soft halo at night: additive, and the same size on screen
 * near or far, so the moored boat's light shows from the overview too.
 */
export function lanternHalo(): SpriteMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const m = new SpriteMaterial({ map: new CanvasTexture(c), color: 0xffa050, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: false });
  m.name = 'boat:lantern halo';
  return m;
}

/** Halo size (share of the view's height, before the boat's own scale). */
const HALO = 0.024;

export function buildBoat(glassMaterial: MeshBasicMaterial, haloMaterial: SpriteMaterial): BoatModel {
  const b = new VoxelBuilder();
  const src = traceSource();
  // 0.1 m cells: fine enough for a slim hull, a low freeboard and a sheer
  // that rises smoothly to the ends (the explorer's own blocks are 5 cm).
  const C = 0.1;
  const g = b.grid({ cell: C, origin: [-C / 2, -0.15, 0], mat: 'wood', jitter: 0.03, ao: 0.2, seed: 41 });
  const half = BOAT_LENGTH / 2;
  const nK = Math.round(half / C);
  const rowOf = (y: number) => Math.round((y + 0.15) / C) - 1;
  for (let k = -nK; k < nK; k++) {
    const e = Math.abs((k + 0.5) * C) / half;
    const hw = halfWidth(e);
    const top = rowOf(sheer(e));
    // The keel rises out of the water towards the ends; the ends are solid.
    const bottom = e < 0.62 ? 0 : e < 0.8 ? 1 : e < 0.92 ? 2 : 3;
    const solid = e > 0.86;
    for (let j = bottom; j <= top; j++) {
      // The bilge rounds in towards the keel.
      const w = hw * (j === bottom ? 0.55 : j === bottom + 1 ? 0.85 : 1);
      const n = Math.max(0, Math.floor((w - 0.03) / C + 0.5));
      for (let i = -n; i <= n; i++) {
        const edge = n - Math.abs(i);
        if (!solid && j >= 2 && edge >= 2) continue;
        // Long planks: one tone per row and side over a run of cells, not a checkerboard.
        const run = Math.floor((k + nK + (j % 2) * 3 + (i < 0 ? 5 : 0)) / 7);
        const side = Math.sign(i);
        let color: number;
        if (j === top) color = pick(CAP, side, j, run, 1);
        else if (edge === 0 && j === top - 1) color = pick(RED, side, 0, Math.floor(k / 9), 2);
        else if (edge === 0 && j === top - 2) color = CREAM[0];
        else if (j === 1 && edge > 0) color = pick(PLANK, i, 0, 0, 5);
        else color = pick(TEAK, side, j, run, 4);
        g.put(i, j, k, { color, src });
      }
    }
  }
  // Thwarts: the seat behind the middle, a brace in front.
  for (const z of [SEAT.z - 0.05, SEAT.z + 0.05, 0.75]) {
    const k = Math.floor(z / C);
    const e = Math.abs((k + 0.5) * C) / half;
    const n = Math.floor((halfWidth(e) - 0.03) / C + 0.5);
    for (let i = -n + 2; i <= n - 2; i++) g.put(i, 2, k, { color: pick(CAP, i, 2, k, 7), src });
  }
  // Stem posts: the bow rises and curls forward over the lantern, the stern a little.
  const endTop = rowOf(sheer((nK - 0.5) / nK));
  const post = (k: number, j: number, color: readonly number[], seed: number) => g.put(0, j, k, { color: pick(color, 0, j, k, seed), src });
  for (let j = endTop + 1; j <= endTop + 3; j++) post(nK - 1, j, TEAK, 8);
  post(nK - 1, endTop + 4, CAP, 9);
  post(nK, endTop + 4, CAP, 9);
  post(nK, endTop + 3, RED, 10);
  post(nK + 1, endTop + 3, RED, 10);
  for (let j = endTop + 1; j <= endTop + 2; j++) post(-nK, j, TEAK, 11);
  post(-nK - 1, endTop + 2, CAP, 12);
  g.commit();

  // Lantern: hung under the curl of the bow post, a small brass cage round the glass.
  const L = LANTERN;
  b.box(0, L.y + 0.12, L.z, 0.02, 0.07, 0.02, BRASS, 'brass', { src });
  b.box(0, L.y + 0.085, L.z, 0.13, 0.025, 0.13, BRASS, 'brass', { src });
  b.box(0, L.y - 0.085, L.z, 0.13, 0.025, 0.13, BRASS, 'brass', { src });
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    b.box(sx * 0.055, L.y, L.z + sz * 0.055, 0.02, 0.15, 0.02, BRASS, 'brass', { src });

  const object = buildVoxelMesh(b, { quality: 'medium', name: 'boat' });
  const glass = new Mesh(new BoxGeometry(0.09, 0.13, 0.09), glassMaterial);
  glass.name = 'boat:lantern glass';
  glass.position.copy(L);
  const halo = new Sprite(haloMaterial);
  halo.name = 'boat:lantern halo';
  halo.position.copy(L);
  halo.scale.setScalar(HALO);
  object.add(glass, halo);
  return { object, glass, blocks: b.boxes.length };
}

/**
 * Double-bladed paddle along its own x axis (true size, 2.1 m), the middle
 * of the shaft at the origin; the blades' faces look along ±z.
 */
export function buildPaddle(): { object: Group; blocks: number } {
  const b = new VoxelBuilder();
  const src = traceSource();
  const len = 2.1;
  // Shaft in three pieces, with leather wraps where the hands hold it.
  b.box(0, 0, 0, 0.36, 0.04, 0.04, CAP[0], 'wood', { src });
  for (const s of [-1, 1]) {
    b.box(s * 0.23, 0, 0, 0.1, 0.05, 0.05, 0x6b3f22, 'leather', { src });
    b.box(s * 0.53, 0, 0, 0.5, 0.04, 0.04, CAP[1], 'wood', { src });
    // Blade: a painted plate and a pale tip.
    b.box(s * (len / 2 - 0.25), 0, 0, 0.34, 0.15, 0.028, RED[1], 'wood', { src });
    b.box(s * (len / 2 - 0.04), 0, 0, 0.08, 0.13, 0.028, CREAM[0], 'wood', { src });
    b.box(s * (len / 2 - 0.44), 0, 0, 0.06, 0.09, 0.03, CAP[2], 'wood', { src });
  }
  return { object: buildVoxelMesh(b, { quality: 'medium', name: 'boat:paddle' }), blocks: b.boxes.length };
}

/**
 * A mooring on the bank (world metres): a post, a rope sagging to the bow,
 * and a few planks laid from the water's edge. `post` is the foot of the
 * post, `bow` where the rope is tied on the boat, `planks` the ends of the
 * landing (on the ground, at the water's edge) and its width.
 */
export function buildMooring(opts: { post: Vector3; height: number; bow: Vector3; landing: [Vector3, Vector3]; width: number; scale: number }): { object: Group; blocks: number } {
  const b = new VoxelBuilder();
  const src = traceSource();
  const s = opts.scale;
  const p = opts.post;
  // Post: two stacked blocks, a darker cap.
  const pw = 0.14 * s;
  b.box(p.x, p.y + opts.height * 0.45, p.z, pw, opts.height * 0.9, pw, TEAK[2], 'wood', { src });
  b.box(p.x, p.y + opts.height * 0.95, p.z, pw * 1.15, opts.height * 0.1, pw * 1.15, PLANK[0], 'wood', { src });
  // Rope: small blocks along a sagging line.
  const a = new Vector3(p.x, p.y + opts.height * 0.8, p.z);
  const c = opts.bow;
  const n = Math.max(4, Math.ceil(a.distanceTo(c) / (0.05 * s)));
  const sag = 0.25 * s;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + (c.x - a.x) * t;
    const z = a.z + (c.z - a.z) * t;
    const y = a.y + (c.y - a.y) * t - sag * 4 * t * (1 - t);
    b.box(x, y, z, 0.04 * s, 0.04 * s, 0.04 * s, ROPE[i % 2], 'leather', { src });
  }
  // Landing: planks across the line from the bank to the water's edge.
  const [l0, l1] = opts.landing;
  const dx = l1.x - l0.x;
  const dz = l1.z - l0.z;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const across = [Math.cos(yaw), -Math.sin(yaw)];
  const planks = Math.max(2, Math.round(opts.width / (0.28 * s)));
  for (let i = 0; i < planks; i++) {
    const u = (i - (planks - 1) / 2) * 0.28 * s;
    const jig = (hash3(i, 3, 7, 21) - 0.5) * 0.12 * s;
    b.box(
      (l0.x + l1.x) / 2 + across[0] * u,
      Math.max(l0.y, l1.y) + 0.05 * s,
      (l0.z + l1.z) / 2 + across[1] * u,
      0.25 * s,
      0.06 * s,
      len + jig,
      pick(CAP, i, 0, 0, 22),
      'wood',
      { src, ry: yaw },
    );
  }
  // Two bearers under the planks.
  for (const t of [0.15, 0.85])
    b.box(l0.x + dx * t, Math.max(l0.y, l1.y) - 0.02 * s, l0.z + dz * t, planks * 0.28 * s + 0.1 * s, 0.08 * s, 0.12 * s, PLANK[1], 'wood', { src, ry: yaw });
  return { object: buildVoxelMesh(b, { quality: 'medium', name: 'boat:mooring' }), blocks: b.boxes.length };
}
