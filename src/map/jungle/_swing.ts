import { Group, Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { HeightField } from '../heightfield';
import type { JungleSite } from '../layout';
import type { MapFrame } from '../types';
import { FERN, MOSS, pickTone, ROPE, Site, stone } from './_campKit';

/**
 * The rope swing on the Bayon's western rim: a big old tree at the cliff
 * edge (a thick buttressed trunk, a spreading crown, a long bough reaching
 * out across the swing), two ropes from the bough to a plank seat, the
 * lake far below beyond the lip. The seat hangs a couple of metres in from
 * the lip, so its forward swing goes out over the drop; the spot where he
 * takes the seat is behind it, well inland.
 *
 * Ridable (roam/_swingRide.ts): `swingSpot()` says where it is; while he
 * rides, the ride sets `angle` every step and this part only draws it;
 * otherwise it stirs in the wind.
 */

/** Where the swing is and how it hangs (m, radians). */
export interface SwingSpot {
  /** The bough's underside over the seat, where the ropes hang from (between them). */
  readonly pivot: Vector3;
  /** The way it swings out (toward (sin, cos)): over the view. */
  readonly yaw: number;
  /** From the pivot down to the seat's top. */
  readonly length: number;
  /** The ropes' half spread across the seat. */
  readonly half: number;
  /** The seat's top at rest. */
  readonly seat: Vector3;
  /** Where he stands to sit on it (feet, on the ground), behind the seat. */
  readonly stand: Vector3;
  /** The swing's angle now (radians, + = out over the view). */
  angle: number;
  /** Someone is on it (the ride sets `angle`). */
  ridden: boolean;
}

let spot: SwingSpot | null = null;

/** The rope swing, once the camps are built (else null). */
export const swingSpot = (): SwingSpot | null => spot;

/** Seat top over the ground at rest, the bough's height over it, the ropes' half spread (m). */
const SEAT_Y = 0.72;
const BOUGH_Y = 7.6;
const HALF = 0.62;
/** The seat's distance in from the lip (m) and the stand spot's behind the seat. */
const FROM_LIP = 2.0;
const STAND = 1.4;

const BARK = [0x6f5a48, 0x655142, 0x7a6450, 0x5c4a3c];
const LEAF = [0x4a7428, 0x578530, 0x3f6522, 0x629236, 0x3a5d20];

export interface SwingBuild {
  /** The ropes and the seat (they move: not solid). */
  readonly object: Group;
  readonly blocks: number;
  update(f: MapFrame): void;
}

/**
 * The tree goes into `b` (solid: its trunk and roots; leaves are soft); the
 * ropes and the seat are their own small mesh under `object`.
 */
export function buildSwing(b: VoxelBuilder, field: HeightField, site: JungleSite, src: SourceTrace | undefined): SwingBuild {
  const g0 = field.heightAt(site.x, site.z);
  // Square to the rim: the way from the site to the nearest drop of 6 m or more (toward its view).
  let best = { score: Infinity, a: site.facing, d: 4 };
  for (let k = -12; k <= 12; k++) {
    const a = site.facing + (k / 12) * 1.3;
    for (let d = 0.5; d < 14; d += 0.25)
      if (field.heightAt(site.x + Math.sin(a) * d, site.z + Math.cos(a) * d) < g0 - 6) {
        // (straight out toward the facing wins a tie)
        const score = d + Math.abs(k) * 0.04;
        if (score < best.score) best = { score, a, d };
        break;
      }
  }
  const yaw = best.a;
  const lip = best.d;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const back = Math.max(0, lip - FROM_LIP);
  const sx = site.x + fx * back;
  const sz = site.z + fz * back;
  const gy = field.heightAt(sx, sz);
  const s = new Site(b, field, sx, gy, sz, yaw, src, 71);
  const seat = s.world(0, SEAT_Y, 0);
  const stand = s.world(0, 0, -STAND);
  stand.y = field.heightAt(stand.x, stand.z);
  const pivot = s.world(0, BOUGH_Y, 0);

  // ── The tree: trunk to the right of the swing, a little behind ──────────
  const tx = -4.0;
  const tz = -1.0;
  const trunkTop = 6.4;
  const tone = (list: readonly number[], i: number, j: number, k: number) => pickTone(list, i, j, k, 71);
  // Trunk: an octagon of bark in lengths, tapering, leaning a little toward the rim.
  const lengths = 5;
  for (let p = 0; p < lengths; p++) {
    const u0 = p / lengths;
    const u1 = (p + 1) / lengths;
    const w = 1.95 - 0.55 * u0;
    const a: [number, number, number] = [tx + 0.25 * u0, trunkTop * u0 - (p === 0 ? 0.4 : 0), tz + 0.2 * u0];
    const c: [number, number, number] = [tx + 0.25 * u1, trunkTop * u1 + 0.1, tz + 0.2 * u1];
    s.log(a, c, w, tone(BARK, p, 1, 1), 'mapBark', 0.95 + 0.08 * hash3(p, 2, 3, 71));
  }
  // Buttress roots flaring out, one creeping over the lip.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const reach = 2.0 + 1.1 * hash3(i, 4, 5, 71);
    const ex = tx + Math.sin(a) * reach;
    const ez = tz + Math.cos(a) * reach;
    s.beam([tx + Math.sin(a) * 0.5, 1.5, tz + Math.cos(a) * 0.5], [ex, s.ground(ex, ez) - 0.1, ez], 0.32, 0.85, tone(BARK, i, 6, 7), 'mapBark', 0, 0.9);
  }
  for (let z = tz + 1; z < tz + 8; z += 0.25)
    if (s.ground(tx + 1.2, z) < -2) {
      s.beam([tx + 0.5, 0.5, tz + 0.6], [tx + 1.2, 0.05, z - 0.25], 0.3, 0.3, tone(BARK, 9, 6, 7), 'mapBark', 0, 0.88);
      s.beam([tx + 1.2, 0.05, z - 0.25], [tx + 1.4, -2.4, z + 0.3], 0.24, 0.24, tone(BARK, 9, 7, 7), 'mapBark', 0, 0.85);
      break;
    }
  // Limbs up into the crown.
  const top: [number, number, number] = [tx + 0.25, trunkTop, tz + 0.2];
  const limbs: [number, number, number][] = [
    [tx - 2.2, 11.5, tz - 1.2],
    [tx + 0.8, 12.5, tz - 2.4],
    [tx - 0.6, 12.8, tz + 1.8],
  ];
  for (const [i, l] of limbs.entries()) s.log(top, l, 0.62 - i * 0.06, tone(BARK, i, 8, 9), 'mapBark');
  // The bough: out from the trunk across the swing, rising a little, thinning to its tip past the ropes.
  const bough: [number, number, number][] = [
    [tx + 0.3, 5.9, tz + 0.2],
    [-1.6, BOUGH_Y + 0.25, -0.15],
    [0, BOUGH_Y + 0.33, 0],
    [1.4, BOUGH_Y + 0.45, 0.1],
    [2.8, BOUGH_Y + 0.75, 0.45],
  ];
  const thick = [0.8, 0.66, 0.6, 0.46];
  for (let i = 0; i + 1 < bough.length; i++) s.log(bough[i], bough[i + 1], thick[i], tone(BARK, i, 10, 11), 'mapBark');
  // A few twigs and leaf tufts along the bough, and a branch up from its tip.
  s.log(bough[3], [2.2, 10.6, 1.4], 0.3, tone(BARK, 5, 10, 11), 'mapBark');

  // Crown: lumpy 1 m leaf blocks over the trunk and out over the swing.
  const leafGrid = b.grid({ cell: 1, origin: [0, 0, 0], mat: 'mapLeaf', jitter: 0.06, ao: 0.3, seed: 72 });
  const blobs: [number, number, number, number][] = [
    [tx + 0.5, 11.0, tz - 0.3, 5.0],
    [1.5, 10.3, 0.6, 3.4],
    [tx - 1.5, 11.4, tz - 2.6, 3.8],
    [tx - 2.6, 10.6, tz + 2.2, 3.2],
    [tx + 0.2, 13.6, tz - 0.8, 3.4],
  ];
  const p = new Vector3();
  for (const [bi, [cx, cy, cz, r]] of blobs.entries()) {
    const c = s.world(cx, cy, cz, new Vector3());
    const ry = r * 0.55;
    for (let x = Math.floor(c.x - r - 1); x <= Math.ceil(c.x + r + 1); x++)
      for (let z = Math.floor(c.z - r - 1); z <= Math.ceil(c.z + r + 1); z++)
        for (let y = Math.floor(c.y - ry - 1); y <= Math.ceil(c.y + ry + 1); y++) {
          p.set(x + 0.5, y + 0.5, z + 0.5);
          const lump = (valueNoise3(p.x / 2.3, p.y / 2.3, p.z / 2.3, 73 + bi) - 0.5) * 0.6;
          const d = Math.hypot((p.x - c.x) / r, (p.y - c.y) / ry, (p.z - c.z) / r) + lump;
          if (d > 1 || leafGrid.has(x, y, z)) continue;
          const shade = 0.74 + 0.36 * Math.min(1, Math.max(0, (p.y - c.y + ry) / (2 * ry))) + (hash3(x, y, z, 74) - 0.5) * 0.1;
          leafGrid.put(x, y, z, { color: pickTone(LEAF, x, y, z, 75), mat: 'mapLeaf', shade });
        }
  }
  // (hanging: a few strands of aerial roots and vines from the bough and the crown's underside)
  leafGrid.commit();
  for (let i = 0; i < 7; i++) {
    const u = 0.15 + 0.8 * hash3(i, 1, 1, 76);
    const k = Math.min(bough.length - 2, Math.floor(u * (bough.length - 1)));
    const f = u * (bough.length - 1) - k;
    const a = bough[k];
    const c = bough[k + 1];
    const x = a[0] + (c[0] - a[0]) * f;
    // (not where the ropes hang)
    if (Math.abs(x) < 1.1) continue;
    const y = a[1] + (c[1] - a[1]) * f - 0.3;
    const z = a[2] + (c[2] - a[2]) * f;
    const len = 1.5 + 3 * hash3(i, 2, 2, 76);
    s.beam([x, y, z], [x + 0.1, y - len, z + 0.05], 0.06, 0.06, i % 2 ? tone(BARK, i, 12, 13) : tone(FERN, i, 12, 13), i % 2 ? 'mapBark' : 'mapLeaf');
  }
  // Moss on the roots, ferns at its foot, a stone by the stand spot.
  stone(s, tx + 2.0, tz - 2.2, 0.9, 1, 0.9);
  stone(s, 2.6, -2.8, 0.7, 2, 0.7);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 1;
    const x = tx + Math.sin(a) * 2.4;
    const z = tz + Math.cos(a) * 2.4;
    if (Math.hypot(x, z + STAND) < 1.6) continue;
    s.box(x, s.ground(x, z) + 0.1, z, 0.7, 0.2, 0.5, tone(MOSS, i, 14, 15), 'mapLeaf', { ry: a });
  }
  // The rope's knots round the bough (they stay put).
  for (const x of [HALF, -HALF]) s.box(x, BOUGH_Y + 0.33, 0, 0.12, 0.72, 0.7, tone(ROPE, x * 10, 16, 17), 'wood');

  // ── Ropes and seat: their own mesh, hung from the pivot ─────────────────
  const rb = new VoxelBuilder();
  const L = BOUGH_Y - SEAT_Y;
  const segs = Math.ceil(L / 0.5);
  for (const x of [HALF, -HALF])
    for (let i = 0; i < segs; i++) {
      const y0 = -(i * L) / segs;
      const y1 = -((i + 1) * L) / segs;
      rb.box(x, (y0 + y1) / 2, 0, 0.055, y0 - y1 - 0.02, 0.055, i % 2 ? 0x7a6446 : 0x86704f, 'wood', { src, ry: (i % 2) * 0.4 });
    }
  // The seat: a thick plank, notched ends where the ropes pass, knots under it.
  rb.box(0, -L - 0.035, 0, 2 * HALF + 0.22, 0.07, 0.34, 0x8a6238, 'wood', { src });
  rb.box(0, -L - 0.07, 0, 2 * HALF - 0.1, 0.03, 0.28, 0x6e4e2c, 'wood', { src });
  for (const x of [HALF, -HALF]) rb.box(x, -L - 0.12, 0, 0.12, 0.1, 0.12, 0x6e5a3e, 'wood', { src });
  const ropes = buildVoxelMesh(rb, { quality: 'medium', name: 'camps:swing' });
  // (it moves: not solid, the walk map leaves it out)
  ropes.traverse((o) => (o.userData.noWalk = true));
  const hang = new Group();
  hang.name = 'camps:swing';
  hang.position.copy(pivot);
  hang.rotation.order = 'YXZ';
  hang.rotation.y = yaw;
  hang.add(ropes);
  const object = new Group();
  object.name = 'camps:swingLive';
  object.add(hang);

  // Keep the trees off the tree and the view: round it, and a widening fan out over the drop.
  field.occupy(Math.min(seat.x, stand.x) - 6, Math.min(seat.z, stand.z) - 6, Math.max(seat.x, stand.x) + 6, Math.max(seat.z, stand.z) + 6);
  for (let z = 2; z <= 22; z += 2)
    for (let x = -3 - z * 0.5; x <= 3 + z * 0.5; x += 2) {
      const q = s.world(x, 0, z, p);
      field.occupy(q.x - 1, q.z - 1, q.x + 1, q.z + 1);
    }

  const state: SwingSpot = { pivot, yaw, length: L, half: HALF, seat, stand, angle: 0, ridden: false };
  spot = state;
  const w = Math.sqrt(9.8 / L);
  return {
    object,
    blocks: rb.boxes.length,
    update(f) {
      if (!state.ridden) {
        // Empty, it stirs in the breeze: a slow sway, a little more in the wind.
        const k = 0.025 + 0.11 * f.weather.wind;
        state.angle = k * (Math.sin(f.t * w) * 0.8 + 0.2 * Math.sin(f.t * w * 0.37 + 1.3));
        hang.rotation.z = 0.03 * Math.sin(f.t * 0.23) * (0.4 + f.weather.wind);
      } else hang.rotation.z = 0;
      hang.rotation.x = -state.angle;
    },
  };
}
