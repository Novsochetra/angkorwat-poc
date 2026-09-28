import { Matrix4, type InstancedMesh } from 'three';
import type { MapPart } from '../types';

/**
 * Planks underfoot: the tops of the wooden blocks of the built parts people
 * walk on (the village's verandas, stairs, jetty and rafts; the camps'
 * bridges and the monk's hut; the hamlets' verandas, stairs, bridge, jetties
 * and salas), in 0.5 m columns, so the footsteps there
 * sound of wood (walker.ts `stepSound`), as on a take-off ramp's deck.
 * Read once from the voxel meshes when the roaming world is built (the
 * rafts bob a few centimetres: well inside the tolerance). Made `later`
 * (roam/world.ts), the meshes are noted as they are then (their block
 * counts and places) and their planks read by `step`, in slices, or all at
 * once by the first question.
 */

/** Parts with wooden floors, and the block families that are wood. */
const PARTS = new Set(['village', 'camps', 'hamlet']);
const WOOD = new Set(['mapBark', 'wood', 'bark']);
/** Column size (m), and how near the feet must be to a plank's top (m). */
const RES = 0.5;
const NEAR = 0.2;

export interface WoodFloor {
  /** Feet at height `y` at (x, z) stand on a plank. */
  at(x: number, z: number, y: number): boolean;
  /** Columns with a plank top. */
  readonly columns: number;
  /** All the planks are read. */
  readonly ready: boolean;
  /** Read more of them, for about `ms` milliseconds; true once all are. */
  step(ms: number): boolean;
  /** Time spent reading them (ms). */
  readonly ms: number;
}

const _m = new Matrix4();
/** Blocks read between two looks at the clock (`step`). */
const STEP_BLOCKS = 1024;

export function buildWoodFloor(parts: readonly MapPart[], later = false): WoodFloor {
  const t0 = performance.now();
  const tops = new Map<number, number[]>();
  const key = (i: number, k: number) => (i + 0x8000) * 0x10000 + (k + 0x8000);
  // The wooden meshes as they are now: their blocks, their places.
  const meshes: { mesh: InstancedMesh; count: number; world: Matrix4 }[] = [];
  for (const part of parts) {
    if (!PARTS.has(part.name)) continue;
    part.object.updateMatrixWorld(true);
    part.object.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.userData.voxelShape || !mesh.count || mesh.userData.noWalk) return;
      if (!WOOD.has(mesh.name.slice(mesh.name.lastIndexOf(':') + 1))) return;
      meshes.push({ mesh, count: mesh.count, world: mesh.matrixWorld.clone() });
    });
  }
  let next = 0;
  let from = 0;
  let work = performance.now() - t0;
  function step(ms: number): boolean {
    const t1 = performance.now();
    const until = t1 + ms;
    while (next < meshes.length) {
      const { mesh, count, world } = meshes[next];
      const end = Math.min(count, from + STEP_BLOCKS);
      for (let n = from; n < end; n++) {
        const e = mesh.getMatrixAt(n, _m).premultiply(world).elements;
        // (a block turned about y: its x and z edges; its top)
        const x = e[12];
        const z = e[14];
        const top = e[13] + 0.5 * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]));
        const hx = 0.5 * (Math.abs(e[0]) + Math.abs(e[8]));
        const hz = 0.5 * (Math.abs(e[2]) + Math.abs(e[10]));
        const iu = 1 / Math.max(1e-6, e[0] * e[0] + e[2] * e[2]);
        const iv = 1 / Math.max(1e-6, e[8] * e[8] + e[10] * e[10]);
        const i0 = Math.floor((x - hx) / RES);
        const i1 = Math.floor((x + hx) / RES);
        const k0 = Math.floor((z - hz) / RES);
        const k1 = Math.floor((z + hz) / RES);
        for (let k = k0; k <= k1; k++)
          for (let i = i0; i <= i1; i++) {
            // (the column's middle on the block's footprint; a block smaller than a column: the one under its middle)
            const dx = (i + 0.5) * RES - x;
            const dz = (k + 0.5) * RES - z;
            const u = 2 * (dx * e[0] + dz * e[2]) * iu;
            const v = 2 * (dx * e[8] + dz * e[10]) * iv;
            const on = (u >= -1 && u < 1 && v >= -1 && v < 1) || (i0 === i1 && k0 === k1);
            if (!on) continue;
            const c = key(i, k);
            const list = tops.get(c);
            if (!list) tops.set(c, [top]);
            else if (!list.some((t) => Math.abs(t - top) < 0.05)) list.push(top);
          }
      }
      from = end;
      if (from >= count) {
        next++;
        from = 0;
      }
      if (performance.now() >= until) break;
    }
    // (the meshes' notes go once all is read)
    if (next >= meshes.length) meshes.length = 0;
    work += performance.now() - t1;
    return next >= meshes.length;
  }
  if (!later) step(Infinity);
  return {
    get columns() {
      return tops.size;
    },
    get ready() {
      return next >= meshes.length;
    },
    get ms() {
      return Math.round(work);
    },
    step,
    at(x, z, y) {
      // (made later and not all read yet: the rest now)
      if (next < meshes.length) step(Infinity);
      const list = tops.get(key(Math.floor(x / RES), Math.floor(z / RES)));
      return !!list && list.some((t) => Math.abs(t - y) < NEAR);
    },
  };
}
