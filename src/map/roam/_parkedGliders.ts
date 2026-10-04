import { Box3, BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, LineSegments, Matrix3, Matrix4, Mesh, Quaternion, Sphere, Vector3, type Camera } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { farJudges, pixelSize, PLAIN_HOLD } from '../graphics';
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
 * They cast shadows on the high level and up, not the still shadows of low
 * and medium (one is lifted off its ramp now and then: a still shadow would stay).
 *
 * Far off, a glider's sail is drawn coarse (`coarseSail`: its 512 cells, a
 * fan of 16 columns by 16 rows each side, joined two columns by four rows,
 * the blue hem row apart: 80 blocks, 97 in all for the sail, not 529): the
 * batch has every glider twice, as built (spot i) and coarse (spot n + i),
 * and shows one of them (no draw more): the coarse one once its sail cells
 * span under `COARSE_PX` of a pixel where it comes nearest the camera
 * (graphics.ts `pixelSize`, every frame from `plainFar`: `farJudges`). What
 * it loses is under a pixel: the cells' own shade (±4 %) and the bend of
 * the sail within a block. The overview's five gliders 32 k triangles → 6 k
 * (low and medium); a glider near keeps every cell.
 */

/** The sail's grid (_gliderModel.ts: side, column, row; the row by the nose first, the last the blue hem), and the cells joined far off. */
const SAIL = { cols: 16, rows: 16, joinCols: 2, joinRows: 4 };
/** A glider far off once its sail's cells span under this many pixels. */
const COARSE_PX = 1;
export class ParkedGliders {
  readonly object = new Group();
  readonly blocks: number;
  private readonly batch: SpotBatch;
  /** The gliders (n), each twice in the batch when its sail can be coarse (`coarseSail`). */
  private readonly n: number;
  private readonly twice: boolean;
  /** The largest cell of the sail (m, world), and round each glider (world). */
  private readonly cell: number = 0;
  private readonly spheres: Sphere[] = [];
  /** The gliders in view (launchSpots.ts), those near (on low), and those drawn coarse (bits, one a glider). */
  private shown = ~0;
  private near = 0;
  private coarse = 0;
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
    // (and the same gliders again with a coarse sail, for far off: none shown at first)
    const sail = coarseSail(shape.families[0]);
    this.n = n;
    this.twice = !!sail && 2 * n < 31;
    this.batch = new SpotBatch('glider', this.twice ? 2 * n : n, { split: true, ownMaterials: true });
    for (let i = 0; i < n; i++) this.batch.add(i, shape.families, rigs[i]);
    if (this.twice) for (let i = 0; i < n; i++) this.batch.add(n + i, [sail!.mesh, ...shape.families.slice(1)], rigs[i]);
    this.batch.finish();
    this.blocks = model.blocks * n;
    if (this.twice) {
      this.cell = sail!.cell * rigs[0].getMaxScaleOnAxis();
      for (let i = 0; i < n; i++) this.spheres.push(this.batch.bounds(i, new Box3()).getBoundingSphere(new Sphere()));
      this.apply();
      farJudges.push((camera) => this.judge(camera));
    }

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
    this.batch.setHidden(this.twice ? mask | (mask << this.n) : mask);
    this.lines();
  }

  /** The gliders whose blocks keep their edges on the low level (bits: near the camera). */
  setNear(mask: number): void {
    this.near = mask;
    this.apply();
  }

  /** The gliders that can be seen, their shadows too (bits: the others are left out). */
  setShown(mask: number): void {
    this.shown = mask;
    this.apply();
  }

  /** The batch's spots: each glider as built, or (coarse) its twin. */
  private apply(): void {
    const all = (1 << this.n) - 1;
    const shown = this.shown & all;
    if (!this.twice) {
      this.batch.setShown(shown);
      this.batch.setNear(this.near);
      return;
    }
    this.batch.setShown((shown & ~this.coarse) | ((shown & this.coarse) << this.n));
    this.batch.setNear((this.near & all) | ((this.near & all) << this.n));
  }

  /** Every frame (graphics.ts `plainFar`): which gliders are far enough for their coarse sail. */
  private judge(camera: Camera): void {
    _eye.setFromMatrixPosition(camera.matrixWorld);
    const from = this.cell / (COARSE_PX * pixelSize(camera));
    let mask = 0;
    for (let i = 0; i < this.spheres.length; i++) {
      const s = this.spheres[i];
      if (s.center.distanceTo(_eye) - s.radius > from * (this.coarse & (1 << i) ? 1 : 1 + PLAIN_HOLD)) mask |= 1 << i;
    }
    if (mask === this.coarse) return;
    this.coarse = mask;
    this.apply();
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

const _eye = new Vector3();

/**
 * The glider's sail far off: its cells (`SAIL`: the first cols × rows × 2 of its `krama` blocks, each side's columns
 * from the nose round to the tip, each column's rows from the nose out to the hem) joined `joinCols` × `joinRows`,
 * the hem row on its own: each joined block flat across its cells, turned as they are on average, their colour the
 * average. The other blocks (the leading edge's pockets, the tip caps, the gold plate) as they are. Null if the
 * blocks are not laid out so (each column's cells turned alike): the sail stays whole. Also the largest cell (m).
 */
function coarseSail(krama: InstancedMesh): { mesh: InstancedMesh; cell: number } | null {
  const { cols, rows, joinCols, joinRows } = SAIL;
  const cells = 2 * cols * rows;
  if (krama.count < cells) return null;
  const e = krama.instanceMatrix.array as Float32Array;
  const axis = (i: number, c: number, out: Vector3) => out.set(e[i * 16 + c * 4], e[i * 16 + c * 4 + 1], e[i * 16 + c * 4 + 2]);
  // (each column's cells point the same way across: the layout is the one expected)
  let cell = 0;
  for (let c = 0; c < 2 * cols; c++)
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r;
      cell = Math.max(cell, axis(i, 0, _a).length(), axis(i, 2, _b).length());
      // (the sail's camber tips them a little: 0.95 at least as built; a column's neighbours are 8° round)
      if (axis(c * rows, 0, _a).normalize().dot(axis(i, 0, _b).normalize()) < 0.9) return null;
    }
  const color = krama.instanceColor!.array as Float32Array;
  const attrs = Object.entries(krama.geometry.attributes).filter(([, a]) => (a as InstancedBufferAttribute).isInstancedBufferAttribute) as [string, InstancedBufferAttribute][];
  const src = krama.userData.voxelSources as (SourceTrace | undefined)[] | undefined;
  /** Each block of the far sail: its matrix, colour, and the block whose other values it takes. */
  const blocks: { m: Matrix4; c: [number, number, number]; like: number }[] = [];
  // Joined cells: rows in runs of `joinRows`, the last row (the hem) apart.
  const runs: [number, number][] = [];
  for (let r = 0; r < rows - 1; r += joinRows) runs.push([r, Math.min(r + joinRows, rows - 1)]);
  runs.push([rows - 1, rows]);
  for (let side = 0; side < 2; side++)
    for (let c0 = 0; c0 < cols; c0 += joinCols)
      for (const [r0, r1] of runs) {
        const members: number[] = [];
        for (let c = c0; c < Math.min(c0 + joinCols, cols); c++) for (let r = r0; r < r1; r++) members.push((side * cols + c) * rows + r);
        // Its axes: the cells' on average; its middle and size: round their corners across it and along it.
        _x.set(0, 0, 0);
        _z.set(0, 0, 0);
        _mid.set(0, 0, 0);
        let thick = 0;
        const c: [number, number, number] = [0, 0, 0];
        for (const i of members) {
          _x.add(axis(i, 0, _a).normalize());
          _z.add(axis(i, 2, _a).normalize());
          _mid.add(_a.set(e[i * 16 + 12], e[i * 16 + 13], e[i * 16 + 14]));
          thick += axis(i, 1, _a).length();
          for (let q = 0; q < 3; q++) c[q] += color[i * 3 + q] / members.length;
        }
        _mid.divideScalar(members.length);
        _x.normalize();
        _y.crossVectors(_z, _x).normalize();
        _z.crossVectors(_x, _y);
        let x0 = Infinity;
        let x1 = -Infinity;
        let z0 = Infinity;
        let z1 = -Infinity;
        // (its top no higher than the lowest of their tops: the sail bends, a flat block would poke through the flags on it)
        let top = Infinity;
        for (const i of members) top = Math.min(top, _a.set(e[i * 16 + 12], e[i * 16 + 13], e[i * 16 + 14]).sub(_mid).dot(_y) + axis(i, 1, _b).length() / 2);
        thick /= members.length;
        for (const i of members)
          for (const [u, w] of [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ]) {
            _a.set(e[i * 16 + 12], e[i * 16 + 13], e[i * 16 + 14]).sub(_mid).addScaledVector(axis(i, 0, _b), u).addScaledVector(axis(i, 2, _b), w);
            const px = _a.dot(_x);
            const pz = _a.dot(_z);
            x0 = Math.min(x0, px);
            x1 = Math.max(x1, px);
            z0 = Math.min(z0, pz);
            z1 = Math.max(z1, pz);
          }
        const at = _a.copy(_mid).addScaledVector(_x, (x0 + x1) / 2).addScaledVector(_z, (z0 + z1) / 2).addScaledVector(_y, top - thick / 2);
        const m = new Matrix4().makeBasis(_b.copy(_x).multiplyScalar(x1 - x0), _y.clone().multiplyScalar(thick), _z.clone().multiplyScalar(z1 - z0)).setPosition(at);
        blocks.push({ m, c, like: members[Math.floor(members.length / 2)] });
      }
  // The rest as they are.
  for (let i = cells; i < krama.count; i++) blocks.push({ m: new Matrix4().fromArray(e, i * 16), c: [color[i * 3], color[i * 3 + 1], color[i * 3 + 2]], like: i });

  const n = blocks.length;
  const geo = new BufferGeometry();
  geo.setIndex(krama.geometry.index);
  geo.setAttribute('position', krama.geometry.getAttribute('position'));
  geo.setAttribute('normal', krama.geometry.getAttribute('normal'));
  for (const [name, a] of attrs) {
    const out = new Float32Array(n * a.itemSize);
    blocks.forEach((b, k) => {
      for (let q = 0; q < a.itemSize; q++) out[k * a.itemSize + q] = a.array[b.like * a.itemSize + q];
    });
    geo.setAttribute(name, new InstancedBufferAttribute(out, a.itemSize));
  }
  const mesh = new InstancedMesh(geo, krama.material, n);
  mesh.name = `${krama.name}:coarse`;
  blocks.forEach((b, k) => {
    mesh.setMatrixAt(k, b.m);
    mesh.instanceColor ??= new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.instanceColor.array.set(b.c, k * 3);
  });
  mesh.castShadow = krama.castShadow;
  mesh.receiveShadow = krama.receiveShadow;
  mesh.customDepthMaterial = krama.customDepthMaterial;
  mesh.userData = { ...krama.userData, voxelSources: src ? blocks.map((b) => src[b.like]) : undefined };
  return { mesh, cell };
}

const _a = new Vector3();
const _b = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _mid = new Vector3();
