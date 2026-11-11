import { Matrix4, Object3D } from 'three';

/**
 * Only what moved gets new matrices.
 *
 * three draws a scene after `scene.updateMatrixWorld()`, and there every
 * object with `matrixAutoUpdate` (the default) composes its matrix again from
 * its position, rotation and scale; the scene does so too, so the whole tree
 * is forced and every object's world matrix is multiplied again: the map's
 * ≈ 3,350 objects every frame, though about 35 move in a walk. In a CPU
 * profile of a phone walk on low that was the top JS function of a drawn
 * frame (≈ 1.9 ms of a 17 ms frame on a cloud CPU; ≈ 0.6 ms on an M1 Max in
 * dev, PERFORMANCE-PLAN.md section 8).
 *
 * Here an object keeps its matrices while
 * - its position, rotation and scale are the numbers its matrix was last
 *   composed from (ten compares instead of a compose and a multiply; three's
 *   `updateMatrix` notes them whoever calls it: code that moves an object for
 *   a moment, reads its world matrix and puts it back leaves no matrix of the
 *   moment behind),
 * - its parent is the same object, and its parent's world matrix was not made
 *   again since its own was (a count on each: three's `updateWorldMatrix`,
 *   which `getWorldPosition` calls, makes a world matrix and clears its flag
 *   without making its children's: the krama's swing does so to its joints),
 * - and it is not marked `matrixWorldNeedsUpdate`, nor forced;
 * an object with `matrixAutoUpdate` off (its matrix set by hand) is made
 * again every pass, as before.
 *
 * Most of what is left is the walk itself (every object's fields read, in a
 * tree of many kinds of object): a part whose objects never move after its
 * build is {@link freezeMatrices frozen} (main.ts `FROZEN`: the land, the
 * trees, the floating village, the road, three temples), and a pass leaves
 * it out while its root is where it was and nothing was added under it since
 * (`add` marks it again: a plain twin, a sharper sculpt, a gathering spot's
 * mesh); every {@link FROZEN_CHECK}th pass walks it anyway, so something
 * moved in it all the same comes along (late, choppy: `matrixcheck=1` names
 * it; such code calls {@link thawMatrices}). Those parts are ≈ 1,800 of the
 * objects. The pass, warm, in a phone walk on a cloud CPU: 0.86–0.89 ms with
 * three's own, 0.30–0.47 here (on a phone, cold in a real frame, the gap is
 * wider: each object read is memory fetched).
 *
 * The picture is the same, pixel for pixel; `matrices=0` in the URL keeps
 * three's own (to compare), `matrixcheck=1` checks every object's world
 * matrix against three's own pass every second, to a float's last bits, and
 * names any that differ (console).
 *
 * Installed by the map page only (main.ts), on three's `Object3D` itself, so
 * it covers every object, cameras and lights too (their own
 * `updateMatrixWorld` calls this one).
 */

/**
 * An object with the numbers its matrix was last composed from, the parent
 * its world matrix was made under, how many times its world matrix was made
 * (`_world`) and its parent's count when its own was made (`_parentWorld`); a
 * frozen root: marked (something added under it since its last walk) and the
 * passes since it was walked.
 */
type Kept = Object3D & { _kept?: Float64Array; _keptParent?: Object3D | null; _world?: number; _parentWorld?: number; _frozen?: boolean; _frozenDirty?: boolean; _frozenAge?: number };

/** A frozen part is walked anyway every this many passes (a safety net: see the file's comment). */
export const FROZEN_CHECK = 30;

/**
 * Its matrix is composed from the position, rotation and scale it has now:
 * they are the numbers its matrix was last composed from, by anyone (three's
 * `updateMatrix`, which {@link installMatrixUpdate} makes note them: code that
 * moves an object for a moment, reads its world matrix — `getWorldPosition`
 * composes it — and puts it back left a matrix of the moment behind).
 */
function composed(o: Kept): boolean {
  const k = o._kept;
  if (!k) return false;
  const p = o.position;
  const q = o.quaternion;
  const s = o.scale;
  return k[0] === p.x && k[1] === p.y && k[2] === p.z && k[3] === q.x && k[4] === q.y && k[5] === q.z && k[6] === q.w && k[7] === s.x && k[8] === s.y && k[9] === s.z;
}

/** Note the numbers its matrix is composed from now (three's `updateMatrix` calls it). */
function keep(o: Kept): void {
  const k = (o._kept ??= new Float64Array(10));
  const p = o.position;
  const q = o.quaternion;
  const s = o.scale;
  k[0] = p.x;
  k[1] = p.y;
  k[2] = p.z;
  k[3] = q.x;
  k[4] = q.y;
  k[5] = q.z;
  k[6] = q.w;
  k[7] = s.x;
  k[8] = s.y;
  k[9] = s.z;
}

function updateMatrixWorld(this: Kept, force?: boolean): void {
  // (its own numbers: composed again below if they changed)
  const own = this.matrixAutoUpdate && (this.pivot !== null || !composed(this));
  const parent = this.parent as Kept | null;
  // (its parent's world matrix made again since its own was, by this pass or by anyone: three's `updateWorldMatrix`,
  // which `getWorldPosition` calls, makes it and clears its flag without its children's)
  const under = parent !== this._keptParent || (parent !== null && parent._world !== this._parentWorld);
  if (this._frozen === true) {
    // (a frozen part where it was, nothing added: left out, but every FROZEN_CHECK passes)
    const age = (this._frozenAge ?? 0) + 1;
    if (force !== true && !own && !under && !this._frozenDirty && !this.matrixWorldNeedsUpdate && this.matrixAutoUpdate && age < FROZEN_CHECK) {
      this._frozenAge = age;
      return;
    }
    this._frozenAge = 0;
    this._frozenDirty = false;
  }
  let changed = force === true || this.matrixWorldNeedsUpdate || under;
  if (this.matrixAutoUpdate) {
    if (own) {
      this.updateMatrix();
      changed = true;
    }
  } else changed = true;
  if (changed) {
    if (this.matrixWorldAutoUpdate === true) {
      if (parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(parent.matrixWorld, this.matrix);
    }
    this.matrixWorldNeedsUpdate = false;
    this._world = (this._world ?? 0) + 1;
    this._keptParent = parent;
    this._parentWorld = parent?._world;
    force = true;
  }
  const children = this.children;
  for (let i = 0, l = children.length; i < l; i++) children[i].updateMatrixWorld(force);
}

/**
 * A part whose objects never move after its build: the pass leaves it out
 * while its root stays where it is and nothing is added under it (see the
 * file's comment). Its next pass walks it all.
 */
export function freezeMatrices(root: Object3D): void {
  if (!installed) return;
  const r = root as Kept;
  r._frozen = true;
  r._frozenDirty = true;
}

/** Something under a frozen part moved (code that moves an object of one): the next pass walks that part. */
export function thawMatrices(o: Object3D): void {
  for (let x: Kept | null = o; x; x = x.parent) if (x._frozen) x._frozenDirty = true;
}

let installed = false;

/** Use it (once, before the map is drawn). */
export function installMatrixUpdate(search = typeof location === 'undefined' ? '' : location.search): void {
  if (installed) return;
  const q = new URLSearchParams(search);
  if (q.get('matrices') === '0') return;
  installed = true;
  Object3D.prototype.updateMatrixWorld = updateMatrixWorld;
  // (whoever composes a matrix, its numbers are noted: see `composed`)
  const compose = Object3D.prototype.updateMatrix;
  Object3D.prototype.updateMatrix = function (this: Kept) {
    compose.call(this);
    keep(this);
  };
  // (whoever makes a world matrix, its children know: three's `updateWorldMatrix` makes it without theirs)
  const world = Object3D.prototype.updateWorldMatrix;
  Object3D.prototype.updateWorldMatrix = function (this: Kept, updateParents: boolean, updateChildren: boolean, force?: boolean) {
    world.call(this, updateParents, updateChildren, force);
    this._world = (this._world ?? 0) + 1;
    this._keptParent = this.parent;
    this._parentWorld = (this.parent as Kept | null)?._world;
  };
  // (an object added under a frozen part — at any depth — gets its matrices at the next pass: the part is walked)
  const add = Object3D.prototype.add;
  Object3D.prototype.add = function (this: Object3D, ...objects: Object3D[]) {
    const out = add.apply(this, objects);
    thawMatrices(this);
    return out;
  };
  if (q.get('matrixcheck') === '1') checkMatrices();
}

/**
 * `matrixcheck=1`: about once a second, right after a scene's pass, every
 * object's world matrix against the one three's own pass would have given
 * (its matrix composed again, times its parent's), and the console names
 * those that differ. `window.__matrixChecks()`: checks made, objects found off.
 */
function checkMatrices(): void {
  const local = new Matrix4();
  const off = (a: Matrix4, b: Matrix4): number => {
    let d = 0;
    for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(a.elements[i] - b.elements[i]));
    return d;
  };
  const wrong = new Map<string, number>();
  let checks = 0;
  let found = 0;
  let due = 0;
  const visit = (o: Object3D, parentWorld: Matrix4 | null): void => {
    if (o.matrixAutoUpdate) {
      local.compose(o.position, o.quaternion, o.scale);
      if (o.pivot !== null) {
        const { x: px, y: py, z: pz } = o.pivot;
        const te = local.elements;
        te[12] += px - te[0] * px - te[4] * py - te[8] * pz;
        te[13] += py - te[1] * px - te[5] * py - te[9] * pz;
        te[14] += pz - te[2] * px - te[6] * py - te[10] * pz;
      }
    } else local.copy(o.matrix);
    const want = parentWorld ? new Matrix4().multiplyMatrices(parentWorld, local) : local.clone();
    if (o.matrixWorldAutoUpdate) {
      const d = off(o.matrixWorld, want);
      // (the same sums in the same order as three's give the same numbers: anything over a float's last bits is off)
      if (d > 1e-9 * (1 + Math.abs(want.elements[12]) + Math.abs(want.elements[13]) + Math.abs(want.elements[14]))) {
        let path = o.name || o.type;
        for (let x = o.parent; x && path.length < 160; x = x.parent) path = `${x.name || x.type} › ${path}`;
        wrong.set(path, Math.max(wrong.get(path) ?? 0, d));
      }
    }
    for (const c of o.children) visit(c, o.matrixWorldAutoUpdate ? want : o.matrixWorld);
  };
  Object3D.prototype.updateMatrixWorld = function (this: Kept, force?: boolean): void {
    updateMatrixWorld.call(this, force);
    if (this.parent !== null || !(this as Object3D & { isScene?: boolean }).isScene) return;
    const now = performance.now();
    if (now < due) return;
    due = now + 1000;
    visit(this, null);
    checks++;
    if (!wrong.size) return;
    found += wrong.size;
    console.warn(`[matrices] ${wrong.size} objects' world matrices differ from three's own (check ${checks}):`, [...wrong].slice(0, 20).map(([k, v]) => `${k} (${v.toFixed(5)})`).join(' · '));
    wrong.clear();
  };
  Object.assign(window, { __matrixChecks: () => ({ checks, found }) });
}
