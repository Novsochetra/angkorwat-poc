import { BufferAttribute, BufferGeometry, Group, LineSegments, Matrix3, Matrix4, Mesh, Quaternion, Vector3, type Box3 } from 'three';
import { Glider } from './_gliderModel';
import { SpotBatch } from './_rampBatch';

/**
 * The hang gliders waiting on the take-off ramps (launchSpots.ts), drawn
 * together: one glider is posed once (open, still, in its own space) and
 * placed on every ramp: its block families in one mesh each for all of them
 * (_rampBatch.ts: plain boxes far off on the low level, their edges near),
 * their wires in one line mesh and their flags in one mesh. 6 draws for the
 * five gliders (30 when each was its own Glider). A glider he took off with
 * is left out (`hide`) until it is back on its ramp.
 *
 * They cast shadows on the medium level and up, not the low level's still
 * ones (one is lifted off its ramp now and then: a still shadow would stay).
 */
export class ParkedGliders {
  readonly object = new Group();
  readonly blocks: number;
  private readonly batch: SpotBatch;
  private readonly wires: LineSegments;
  private readonly flags: Mesh;
  private hidden = 0;
  /** Points of one glider's wires and flags, and indices of its flags. */
  private readonly wireN: number;
  private readonly flagN: number;
  private readonly flagIndex: ArrayLike<number>;

  /** `rigs`: each parked glider's hang point, turn and size (world), one per ramp. */
  constructor(rigs: readonly Matrix4[]) {
    this.object.name = 'parkedGliders';
    const n = rigs.length;
    // One glider, open and at rest, as it waits on a ramp (its tip lamps soft: they glow while it flies).
    const model = new Glider();
    model.pose({ position: new Vector3(), quaternion: new Quaternion(), size: 1, open: 1, flutter: 0.05, t: 0, night: 0 });
    const shape = model.shape();
    this.batch = new SpotBatch('glider', n, { split: true, ownMaterials: true });
    for (let i = 0; i < n; i++) this.batch.add(i, shape.families, rigs[i]);
    this.batch.finish();
    this.blocks = model.blocks * n;

    // Wires: pairs of points, each glider's placed.
    const w = shape.wires;
    this.wireN = w.length / 3;
    const wirePos = new Float32Array(n * w.length);
    const v = new Vector3();
    for (let i = 0; i < n; i++) for (let j = 0; j < w.length; j += 3) v.fromArray(w, j).applyMatrix4(rigs[i]).toArray(wirePos, i * w.length + j);
    const wireGeo = new BufferGeometry();
    wireGeo.setAttribute('position', new BufferAttribute(wirePos, 3));
    wireGeo.setIndex(new BufferAttribute(new Uint16Array(n * this.wireN), 1));
    wireGeo.computeBoundingSphere();
    this.wires = new LineSegments(wireGeo, shape.wireMaterial);
    this.wires.name = 'glider:wires';

    // Flags: the panels' corners placed, their normals turned (the size scales them, not their normals).
    const f = shape.flags;
    const fp = f.getAttribute('position').array as Float32Array;
    const fn = f.getAttribute('normal').array as Float32Array;
    const fuv = f.getAttribute('uv').array as Float32Array;
    this.flagIndex = f.index!.array;
    this.flagN = fp.length / 3;
    const pos = new Float32Array(n * fp.length);
    const nor = new Float32Array(n * fn.length);
    const uv = new Float32Array(n * fuv.length);
    const turn = new Matrix3();
    for (let i = 0; i < n; i++) {
      turn.getNormalMatrix(rigs[i]);
      for (let j = 0; j < fp.length; j += 3) {
        v.fromArray(fp, j).applyMatrix4(rigs[i]).toArray(pos, i * fp.length + j);
        v.fromArray(fn, j).applyMatrix3(turn).normalize().toArray(nor, i * fn.length + j);
      }
      uv.set(fuv, i * fuv.length);
    }
    const flagGeo = new BufferGeometry();
    flagGeo.setAttribute('position', new BufferAttribute(pos, 3));
    flagGeo.setAttribute('normal', new BufferAttribute(nor, 3));
    flagGeo.setAttribute('uv', new BufferAttribute(uv, 2));
    flagGeo.setIndex(new BufferAttribute(new Uint16Array(n * this.flagIndex.length), 1));
    flagGeo.computeBoundingSphere();
    this.flags = new Mesh(flagGeo, shape.flagMaterial);
    this.flags.name = 'glider:flags';
    this.flags.receiveShadow = true;
    this.lines();
    this.object.add(this.batch.object, this.wires, this.flags);
  }

  /** Glider `i` off its ramp (he took off with it), or back on it. */
  hide(i: number, off: boolean): void {
    const mask = off ? this.hidden | (1 << i) : this.hidden & ~(1 << i);
    if (mask === this.hidden) return;
    this.hidden = mask;
    this.batch.setHidden(mask);
    this.lines();
  }

  /** The gliders whose blocks keep their edges on the low level (bits: near the camera). */
  setNear(mask: number): void {
    this.batch.setNear(mask);
  }

  /** The gliders that can be seen, their shadows too (bits: the others are left out). */
  setShown(mask: number): void {
    this.batch.setShown(mask);
  }

  /** A box round glider `i`'s blocks (world) added to `out`. */
  bounds(i: number, out: Box3): Box3 {
    return this.batch.bounds(i, out);
  }

  /** Every frame: the graphics level's block shapes. */
  flush(): void {
    this.batch.flush();
  }

  /** The wires and flags of the gliders on their ramps (the others' left out of the index). */
  private lines(): void {
    const wi = this.wires.geometry.index!;
    const fi = this.flags.geometry.index!;
    const wa = wi.array as Uint16Array;
    const fa = fi.array as Uint16Array;
    let nw = 0;
    let nf = 0;
    const n = wa.length / this.wireN;
    for (let i = 0; i < n; i++) {
      if (this.hidden & (1 << i)) continue;
      for (let j = 0; j < this.wireN; j++) wa[nw++] = i * this.wireN + j;
      for (let j = 0; j < this.flagIndex.length; j++) fa[nf++] = i * this.flagN + this.flagIndex[j];
    }
    this.wires.geometry.setDrawRange(0, nw);
    this.flags.geometry.setDrawRange(0, nf);
    this.wires.visible = nw > 0;
    this.flags.visible = nf > 0;
    wi.needsUpdate = true;
    fi.needsUpdate = true;
  }
}
