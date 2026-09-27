import type { InstancedMesh, Object3D } from 'three';
import { CELL, type HeightField } from '../heightfield';
import { OVERVIEW } from '../layout';

/**
 * What the overview camera can see of the land, so the picker's screen draws
 * only that (terrain.ts): the land behind Phnom Kulen, the valleys behind the
 * summit and the hills, the far sides of the mesas are left out while the
 * camera rests there (a quarter of the land's triangles in its frame).
 *
 * A viewshed over the height field, one value per 2 m cell (1: some of its
 * column shows): rays fan out from the camera over its frame, with a margin
 * for the widest windows and its lean; along each, a column shows if its top
 * rises over the line of sight of every column in front of it. Trees and
 * temples, which hide more, are left out, so it only ever says too much is
 * seen; and it is grown by two cells all round (bevels, blocks reaching into
 * their neighbours, the camera's sway).
 */
export function overviewSeen(f: HeightField): Uint8Array {
  const hit0 = seenOf.get(f);
  if (hit0) return hit0;
  const { nx, nz, height } = f;
  const hit = new Uint8Array(nx * nz);
  const [cx, cy, cz] = OVERVIEW.pos;
  // Straight ahead (on the map) and the half width of the fan (rad): the widest window planned
  // for (views.ts MAX_ASPECT: 53°) and a margin.
  const ahead = Math.atan2(OVERVIEW.target[0] - cx, -(OVERVIEW.target[2] - cz));
  const HALF = 1.05;
  // Rays about a cell apart out at the far corners, sampled every 2 m (what they miss, the growing covers).
  const far = Math.hypot(Math.max(cx - f.x0, f.x0 + nx * CELL - cx), cz - f.z0);
  const rays = Math.ceil((2 * HALF * far) / CELL);
  const STEP = CELL;
  const x1 = f.x0 + nx * CELL;
  const z1 = f.z0 + nz * CELL;
  for (let r = 0; r <= rays; r++) {
    const a = ahead - HALF + (2 * HALF * r) / rays;
    const dx = Math.sin(a);
    const dz = -Math.cos(a);
    let best = -Infinity;
    let inside = false;
    for (let t = STEP; t < far + STEP; t += STEP) {
      const x = cx + dx * t;
      const z = cz + dz * t;
      if (x < f.x0 || x >= x1 || z < f.z0 || z >= z1) {
        if (inside) break;
        continue;
      }
      inside = true;
      const c = Math.floor((x - f.x0) / CELL) + Math.floor((z - f.z0) / CELL) * nx;
      const s = (height[c] - cy) / t;
      if (s >= best - 1e-4) hit[c] = 1;
      if (s > best) best = s;
    }
  }
  // Grow by two cells.
  let seen = hit;
  for (let pass = 0; pass < 2; pass++) {
    const out = seen.slice();
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const c = i + k * nx;
        if (seen[c]) continue;
        if ((i > 0 && seen[c - 1]) || (i < nx - 1 && seen[c + 1]) || (k > 0 && seen[c - nx]) || (k < nz - 1 && seen[c + nx])) out[c] = 1;
      }
    seen = out;
  }
  seenOf.set(f, seen);
  return seen;
}
/** (made once per land: the terrain and the glider ramps ask) */
const seenOf = new WeakMap<HeightField, Uint8Array>();

/**
 * Note on every instanced mesh under `root` how many of its first blocks the
 * overview camera sees (`userData.seenCount`) and how many it has
 * (`userData.allCount`); a mesh whose seen blocks are not all first (the
 * mixed "rest" of a family, VoxelMesh.ts) keeps all of them.
 */
export function countSeen(root: Object3D, seenAt: (x: number, z: number) => boolean): void {
  root.traverse((o) => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh) return;
    const e = m.instanceMatrix.array;
    let lead = 0;
    let all = 0;
    for (let i = 0; i < m.count; i++)
      if (seenAt(e[i * 16 + 12], e[i * 16 + 14])) {
        all++;
        if (lead === i) lead++;
      }
    m.userData.allCount = m.count;
    m.userData.seenCount = lead === all ? lead : m.count;
  });
}

/**
 * Draw only the seen blocks (`on`) or all of them, in every mesh under `root`
 * noted by `countSeen` (and their plain twins); a mesh with none seen is not
 * drawn at all.
 */
export function showSeen(root: Object3D, on: boolean): void {
  root.traverse((o) => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh || m.userData.allCount === undefined) return;
    m.count = on ? m.userData.seenCount : m.userData.allCount;
    m.visible = m.count > 0;
  });
}
