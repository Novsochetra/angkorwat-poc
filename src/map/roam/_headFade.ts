import { Matrix4, type InstancedMesh, type Object3D, type PerspectiveCamera, type Vector3 } from 'three';

/**
 * His head and hat fade while the follow camera is close behind them in a
 * narrow built room (followCam.ts `ownNear`: a wall of the player's blocks
 * brought it in nearer than its usual closest, 1.6 m): his hat would fill the
 * view. They dissolve block by block (each block of the head joint's meshes —
 * head, hair, hat, face — shrinks away in a fixed scattered order as the fade
 * grows: a dither of whole blocks), so no material or shader changes (no new
 * program). Anywhere else (the world's own places, a shot not that close)
 * nothing changes. His shadow loses the faded blocks meanwhile.
 */

/** The camera's distance from the focus (his neck, m) where the fade starts, and where it is whole. */
const FROM = 1.7;
const FULL = 1.45;
/** How fast it fades in and out (1/s). */
const RATE = 6;

const kept = new WeakMap<InstancedMesh, { matrices: Float32Array; count: number }>();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
let amount = 0;
let shown = 0;

/** A block's place in the fade order (0‥1, golden-ratio scattered). */
const order = (i: number) => (i * 0.6180339887498949 + 0.3) % 1;

/**
 * Each frame of roaming: `near` the follow camera is nearer him than usual
 * for a built wall (else 0 fade), `camera` and `focus` give the distance;
 * `dt` 1 in a still shot (at once). `head` is the explorer's head joint.
 */
export function fadeHead(head: Object3D, near: boolean, camera: PerspectiveCamera, focus: Vector3, dt: number): void {
  const d = camera.position.distanceTo(focus);
  const goal = near ? Math.min(1, Math.max(0, (FROM - d) / (FROM - FULL))) : 0;
  amount += (goal - amount) * (1 - Math.exp(-RATE * Math.max(0, dt)));
  if (Math.abs(goal - amount) < 0.01) amount = goal;
  // (quantised: a block more or less is a change; nothing to do while it holds)
  const q = Math.round(amount * 64) / 64;
  if (q === shown && !(q > 0 && fresh(head))) return;
  shown = q;
  head.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    let k = kept.get(mesh);
    if (!q) {
      if (k) {
        (mesh.instanceMatrix.array as Float32Array).set(k.matrices);
        mesh.instanceMatrix.needsUpdate = true;
        kept.delete(mesh);
      }
      return;
    }
    if (!k) {
      k = { matrices: (mesh.instanceMatrix.array as Float32Array).slice(), count: mesh.count };
      kept.set(mesh, k);
    }
    const a = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < k.count; i++) {
      if (order(i) < q) {
        // (shrunk to nothing where it stands)
        _m.copy(_zero).setPosition(k.matrices[i * 16 + 12], k.matrices[i * 16 + 13], k.matrices[i * 16 + 14]);
        _m.toArray(a, i * 16);
      } else a.set(k.matrices.subarray(i * 16, i * 16 + 16), i * 16);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/** A mesh under the head not faded yet (a new hat, a face shown): fade it too. */
function fresh(head: Object3D): boolean {
  let any = false;
  head.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (mesh.isInstancedMesh && !kept.has(mesh)) any = true;
  });
  return any;
}
