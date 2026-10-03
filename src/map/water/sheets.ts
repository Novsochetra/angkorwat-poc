import { DynamicDrawUsage, Frustum, Matrix4, Sphere, Vector3, type BufferAttribute, type Mesh, type PerspectiveCamera } from 'three';
import { pixelSize } from '../graphics';
import type { FallPiece } from './falls';

/**
 * The waterfalls' sheets drawn as they can be seen (water.ts): one mesh for
 * every fall and step on the map (falls.ts), so three would draw all of it
 * wherever one is in view (21 k triangles, twice: a see-through sheet seen
 * from both sides is drawn back faces first). Its index is made again from
 * the pieces in view (a fall or a step: `FallPiece`), each fall near with
 * all its triangles or far with about a quarter of them (the columns and
 * rows where it bends: falls.ts `FAR_TOL`; `err` says how far they stray
 * from the near ones, 0.08–0.16 m, its shape and where its streaks run),
 * once that is under {@link FAR_PX} of a pixel ({@link pixelSize}: a zoomed
 * photo or a sharper picture keeps the near ones further: from 70–135 m in
 * a walk on a phone, 170–320 m at 1672 × 941). In the overview 42 k → 10 k
 * triangles, in the walks 1–10 k (by the Kulen falls their three near).
 * Still one mesh, two draws; the index is written again only when a piece
 * comes into view, goes, or changes. In the first frames every piece is
 * drawn near (the shader compiles at load).
 */

/** A fall far off takes its far triangles once they stray under this much of a pixel from its near ones. */
const FAR_PX = 0.5;
/** …and its near ones again this share nearer (no flicker while the camera sways on the line). */
const HOLD = 0.06;
/** A piece is drawn while a sphere this much bigger than it (m, and this share of its distance) is in view: the camera turns between the test and the picture. */
const PAD = { m: 2, perM: 0.03 };
/** Frames at load when every piece is drawn, near. */
const WARM = 3;

const HIDDEN = 0;
const NEAR = 1;
const FAR = 2;

export class FallSheets {
  /** The index as built (every piece near), and each fall's far triangles in the same kind of array. */
  private readonly all: Uint16Array | Uint32Array;
  private readonly far: (Uint16Array | Uint32Array | null)[];
  private readonly index: BufferAttribute;
  /** Each piece now: hidden, near or far (−1: not yet). */
  private readonly state: Int8Array;
  private frames = 0;
  /** Indices drawn now (checks). */
  drawn = 0;

  constructor(
    private readonly mesh: Mesh,
    private readonly pieces: readonly FallPiece[],
  ) {
    const index = mesh.geometry.index!;
    index.setUsage(DynamicDrawUsage);
    this.index = index;
    const a = index.array as Uint16Array | Uint32Array;
    this.all = a.slice();
    const Kind = a instanceof Uint16Array ? Uint16Array : Uint32Array;
    this.far = pieces.map((p) => (p.far ? Kind.from(p.far) : null));
    this.state = new Int8Array(pieces.length).fill(-1);
  }

  update(camera: PerspectiveCamera): void {
    const warm = this.frames++ < WARM;
    let pixel = 0;
    if (!warm) {
      // (roaming moves the camera before main.ts updates its matrices)
      camera.updateMatrixWorld();
      _frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      _eye.setFromMatrixPosition(camera.matrixWorld);
      pixel = pixelSize(camera);
    }
    let changed = false;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      let s = NEAR;
      if (!warm) {
        const d = _eye.distanceTo(p.sphere.center);
        _sphere.center.copy(p.sphere.center);
        _sphere.radius = p.sphere.radius + PAD.m + PAD.perM * Math.max(0, d - p.sphere.radius);
        if (!_frustum.intersectsSphere(_sphere)) s = HIDDEN;
        else if (this.far[i]) {
          const from = p.err / (FAR_PX * pixel);
          s = d - p.sphere.radius > from * (this.state[i] === FAR ? 1 : 1 + HOLD) ? FAR : NEAR;
        }
      }
      if (s !== this.state[i]) {
        this.state[i] = s;
        changed = true;
      }
    }
    if (changed) this.write();
    this.mesh.visible = this.drawn > 0;
  }

  /** The index from the pieces as they are now. */
  private write(): void {
    const out = this.index.array as Uint16Array | Uint32Array;
    let n = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      const s = this.state[i];
      if (s === HIDDEN) continue;
      const p = this.pieces[i];
      const far = this.far[i];
      if (s === FAR && far) {
        out.set(far, n);
        n += far.length;
      } else {
        out.set(this.all.subarray(p.start, p.start + p.count), n);
        n += p.count;
      }
    }
    this.drawn = n;
    this.mesh.geometry.setDrawRange(0, n);
    if (!n) return;
    this.index.clearUpdateRanges();
    this.index.addUpdateRange(0, n);
    this.index.needsUpdate = true;
  }
}

const _frustum = new Frustum();
const _m = new Matrix4();
const _eye = new Vector3();
const _sphere = new Sphere();
