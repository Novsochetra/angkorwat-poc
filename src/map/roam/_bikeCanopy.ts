import { Matrix4, type InstancedMesh } from 'three';
import type { HeightField } from '../heightfield';
import type { MapPart } from '../types';

/**
 * What hangs at the explorer's head's height on the bicycle (roam/_bike.ts): a
 * stall's umbrella or awning, cloth on a line, vines and leaves hanging from a
 * gallery's wall. Cloth and leaves are not in the walk map (on foot he walks
 * under and through them, his hat brushing), and the camera's soft walk map is
 * a snapshot: the markets fold their stalls' umbrellas and tarps away and put
 * them back with the time of day (hamlet/_mkToggles.ts: their instance matrices
 * are zeroed, and saved). So this index is made once, when roaming is built,
 * before any part's first update (every toggled box still where the build put
 * it), of the soft boxes that hang with room under them (their bottom 1‥2.6 m
 * over the land: not a pole, a trunk or a bush from the ground, not a tarp up
 * over his hat), and a question reads each box's matrix as it is now (a folded
 * one is not there).
 *
 * The trees (`vegetation`) are left out: their low leaves he rides through as
 * he walks through them. Cheap: ≈ 3 000 boxes in 4 m cells, made in ≈ 2 ms;
 * a question looks at the few in one cell, no allocation.
 */

/** Families that are cloth and leaves (walkmap.ts `SEE_THROUGH` less bark). */
const SOFT = new Set(['mapLeaf', 'leaves', 'foliage', 'petal']);
/** Parts with nothing that hangs over a way he rides, or that move (walkmap.ts `SKIP_PARTS`), and the trees. */
const SKIP = new Set(['atmosphere', 'water', 'undergrowth', 'clouds', 'rain', 'rainbow', 'life', 'people', 'jungleFauna', 'paddies', 'festival', 'treasure', 'roam', 'vegetation', 'terrain']);
/** A box hangs: its bottom this high over the land (m), and its top at least this high. */
const BOTTOM = [1.0, 2.6] as const;
const TOP = 1.9;
/** Cell size (m). */
const CELL = 4;

const meshes: InstancedMesh[] = [];
/** Each mesh's world matrix inverted (null: none, the usual). */
const invWorld: (Matrix4 | null)[] = [];
/** Cell key → [mesh, instance, mesh, instance, …]. */
const cells = new Map<number, number[]>();
let built = false;

const key = (i: number, k: number) => (i + 4096) * 8192 + (k + 4096);

/** Index the hanging soft boxes of `parts` (once: before their first update). */
export function buildCanopies(parts: readonly MapPart[], field: HeightField): number {
  if (built) return countBoxes();
  built = true;
  const id = new Matrix4();
  let n = 0;
  for (const part of parts) {
    if (SKIP.has(part.name)) continue;
    part.object.updateMatrixWorld(true);
    part.object.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.userData.voxelShape || !mesh.count) return;
      if (!SOFT.has(mesh.name.slice(mesh.name.lastIndexOf(':') + 1))) return;
      const world = mesh.matrixWorld.equals(id) ? null : mesh.matrixWorld;
      const w = world?.elements;
      const a = mesh.instanceMatrix.array as Float32Array;
      let m = -1;
      for (let i = 0; i < mesh.count; i++) {
        const b = i * 16;
        if (a[b + 15] === 0) continue;
        // (its box in the world: the middle, and how far it reaches along each axis)
        let cx = a[b + 12];
        let cy = a[b + 13];
        let cz = a[b + 14];
        let hx = 0.5 * (Math.abs(a[b]) + Math.abs(a[b + 4]) + Math.abs(a[b + 8]));
        let hy = 0.5 * (Math.abs(a[b + 1]) + Math.abs(a[b + 5]) + Math.abs(a[b + 9]));
        let hz = 0.5 * (Math.abs(a[b + 2]) + Math.abs(a[b + 6]) + Math.abs(a[b + 10]));
        if (w) {
          const x = cx;
          const y = cy;
          const z = cz;
          cx = w[0] * x + w[4] * y + w[8] * z + w[12];
          cy = w[1] * x + w[5] * y + w[9] * z + w[13];
          cz = w[2] * x + w[6] * y + w[10] * z + w[14];
          const s = Math.cbrt(Math.abs(world!.determinant()));
          hx *= s;
          hy *= s;
          hz *= s;
        }
        const land = field.heightAt(cx, cz);
        const bottom = cy - hy - land;
        if (bottom < BOTTOM[0] || bottom > BOTTOM[1] || cy + hy - land < TOP) continue;
        if (m < 0) {
          m = meshes.length;
          meshes.push(mesh);
          invWorld.push(world ? world.clone().invert() : null);
        }
        for (let ix = Math.floor((cx - hx) / CELL); ix <= Math.floor((cx + hx) / CELL); ix++)
          for (let iz = Math.floor((cz - hz) / CELL); iz <= Math.floor((cz + hz) / CELL); iz++) {
            const k = key(ix, iz);
            let list = cells.get(k);
            if (!list) cells.set(k, (list = []));
            list.push(m, i);
          }
        n++;
      }
    });
  }
  return n;
}

function countBoxes(): number {
  let n = 0;
  for (const l of cells.values()) n += l.length / 2;
  return n;
}

/** Checks: the hanging box at (x, y, z) now (its mesh's name and instance), or null. */
export function canopyWho(x: number, y: number, z: number): string | null {
  return canopyAt(x, y, z) ? `${meshes[found[0]].name} #${found[1]}` : null;
}
/** The last box `canopyAt` found: [mesh, instance]. */
const found = [0, 0];

/** Is a hanging box (as it is now: one folded away is not there) at (x, y, z)? */
export function canopyAt(x: number, y: number, z: number): boolean {
  const list = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return false;
  for (let j = 0; j < list.length; j += 2) {
    const mesh = meshes[list[j]];
    const a = mesh.instanceMatrix.array as Float32Array;
    const b = list[j + 1] * 16;
    if (a[b + 15] === 0) continue;
    let px = x;
    let py = y;
    let pz = z;
    const inv = invWorld[list[j]];
    if (inv) {
      const e = inv.elements;
      px = e[0] * x + e[4] * y + e[8] * z + e[12];
      py = e[1] * x + e[5] * y + e[9] * z + e[13];
      pz = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    // (in the box's own frame: its matrix's columns are its axes, each as long as the box is that way; a unit cube)
    const dx = px - a[b + 12];
    const dy = py - a[b + 13];
    const dz = pz - a[b + 14];
    let inside = true;
    for (let c = 0; c < 3 && inside; c++) {
      const ax = a[b + c * 4];
      const ay = a[b + c * 4 + 1];
      const az = a[b + c * 4 + 2];
      const l2 = ax * ax + ay * ay + az * az;
      if (l2 < 1e-10) inside = false;
      else inside = Math.abs((dx * ax + dy * ay + dz * az) / l2) <= 0.5;
    }
    if (inside) {
      found[0] = list[j];
      found[1] = list[j + 1];
      return true;
    }
  }
  return false;
}
