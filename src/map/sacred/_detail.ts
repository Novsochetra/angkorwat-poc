import { Group, Layers, LOD, Vector3, type Camera, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { sceneHeight } from '../resolution';
import { trackSacred } from './pending';

/**
 * How much of a sculpted piece is drawn (statues, stupas, naga, parasols):
 * its detail levels, finest first, picked by how big the piece is on
 * screen, not by metres alone, so a zoomed photo, the free camera or a
 * sharper picture keeps the detail and a phone's small picture draws less.
 *
 * - The levels the pieces always had (the near and far meshes) switch as
 *   they did: the far one past `near` m. A sharper picture or a zoom than
 *   the reference (the roaming camera on a 2× screen, {@link REF_PIXEL})
 *   takes the metres further, never nearer.
 * - Each coarser level (with a `cell`: the grid it was sculpted on) shows
 *   only past {@link FLOOR} m (up close the picture stays as it was) and
 *   once its cells span at most {@link SHARP_PX} pixels: detail under about
 *   a pixel is what it leaves out.
 * - Nothing is drawn past `hide` m (as `near`), nor, past {@link FLOOR} m,
 *   once the whole piece spans under {@link HIDE_PX} pixels.
 * - A switch to a coarser level waits until the piece is {@link HOLD} further
 *   (no flicker on the line); a finer one comes at once.
 *
 * Levels are made when first wanted: the coarsest at once, the others when
 * the camera comes within {@link AHEAD} times the distance they show from
 * (sculpted in a worker; meanwhile the nearest level made stands in), all of
 * them at once in shots (a video never shows a stand-in) and with `eager`.
 * Shots wait for them (pending.ts).
 *
 * Shadows: on low and medium the shadow map is still (graphics.ts
 * `markStill`): drawn once, then again only when the light turns, so a
 * switch made after it would leave the old level's shadow, or none. A piece
 * with a `caster` has one stand-in that casts its still shadows whatever
 * the camera sees: a copy of that level's mesh on no layer the camera draws
 * (it gets the still layer with its part), while its shown meshes keep to
 * the camera's layer (they cast the live shadows of high and max, drawn
 * every frame or third). The shadow map's texels (0.25–0.5 m) are far
 * coarser than any level, so the coarse stand-in casts the same shadow.
 * Pieces without one (the small offerings) cast as before, from their level.
 */

/** A coarser level's cells span at most this many pixels where it shows. */
export const SHARP_PX = 1.2;
/** A piece whose largest extent spans fewer pixels than this is not drawn. */
export const HIDE_PX = 2;
/** Within this distance (m, as `near`) no piece is coarser than it always was, nor hidden by its size. */
export const FLOOR = 30;
/** One pixel (m, a metre away) of the reference picture: the roaming camera (50°) on a screen 1800 px high. */
export const REF_PIXEL = (2 * Math.tan((25 * Math.PI) / 180)) / 1800;
/** A switch to a coarser level waits until the piece is this share further away. */
const HOLD = 0.08;
/** A level is made once the camera is within this many times the distance it shows from. */
const AHEAD = 2.5;

/** Shots make every level at once. */
const EAGER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('shot');

/** One pixel's size (m) a metre from the camera, now (graphics.ts `pixelSize`, without its imports: the sculpting workers load this file). */
function pixelOf(camera: Camera): number {
  const c = camera as PerspectiveCamera;
  const fov = c.isPerspectiveCamera ? c.getEffectiveFOV() : 60;
  return (2 * Math.tan((fov * Math.PI) / 360)) / sceneHeight();
}

/** Layers that keep to the camera's (layer 0): a level's meshes never take the still layer (graphics.ts `markStill`), so they cast no still shadow. */
class ViewLayers extends Layers {
  override enable(layer: number): void {
    if (layer === 0) super.enable(0);
  }
}

export interface DetailLevel {
  /** Its name (the probe's and the bug report's): `near`, `far`, `mid`, `coarse`. */
  name: string;
  /** Its cell (m, in the sculpt's units: times the piece's `unit` and world scale; its coarsest grid): a coarser level than the pieces had shows past {@link FLOOR} m once this spans at most {@link SHARP_PX} pixels. 0: one they had (it keeps its metres). Level 0's is not used. */
  cell: number;
  /** Makes the level's object (once, when first wanted), or a promise of it; `lod` is the piece's (to set its `unit`). */
  load(lod: SacredLod): Object3D | Promise<Object3D>;
}

export interface DetailOptions {
  /** Level 0 shows within this distance (m, at {@link REF_PIXEL}; further on a sharper picture); 0: level 1 takes over by its own cell. */
  near: number;
  /** Not drawn past this distance (m, as `near`). */
  hide: number;
  /** The piece's largest extent (m, in its own space: times its world scale): not drawn under {@link HIDE_PX} pixels. */
  size: number;
  /** Its distance is measured to a sphere this big (m, own space) round its origin: a whole roof's naga merged in one mesh. */
  radius?: number;
  /** The level whose mesh, once made, casts the piece's still shadows (see the file's note); none: each level casts its own. */
  caster?: number;
  /** Make every level now (the preview; offerings made on this thread anyway). */
  eager?: boolean;
}

const _eye = new Vector3();
const _at = new Vector3();

/**
 * A sculpted piece's levels (see the file's note): an LOD three updates as
 * it draws (`update` with the camera, for each picture), its levels in
 * groups named `<piece>:<level>`, its still-shadow stand-in `<piece>:shadow`.
 */
export class SacredLod extends LOD {
  /** Sculpt units to the piece's own space: multiplies the levels' cells (a statue whose meshes are each scaled to its height). */
  unit = 1;
  private readonly slots: Group[] = [];
  private readonly made: boolean[] = [];
  private readonly asked: boolean[] = [];
  /** The level the camera asks for ({@link specs}.length: none). */
  private level: number;
  private forced = -1;

  constructor(
    name: string,
    private readonly specs: DetailLevel[],
    private readonly o: DetailOptions,
  ) {
    super();
    this.name = name;
    this.level = specs.length;
    for (const s of specs) {
      const g = new Group();
      g.name = `${name}:${s.name}`;
      g.visible = false;
      this.slots.push(g);
      this.made.push(false);
      this.asked.push(false);
      this.add(g);
    }
    if (o.eager || EAGER) for (let i = specs.length - 1; i >= 0; i--) this.want(i);
    else this.want(specs.length - 1);
  }

  /** The level's object once made (the preview's counts), else null. */
  levelObject(i: number): Object3D | null {
    return this.made[i] ? (this.slots[i].children[0] ?? null) : null;
  }

  /** How many levels. */
  get levelCount(): number {
    return this.specs.length;
  }

  /** Always show this level (made now if it is not yet: the preview); −1: as the camera asks. */
  force(i: number): void {
    this.forced = i;
    if (i >= 0) this.want(i);
    this.show();
  }

  override update(camera: Camera): void {
    const n = this.specs.length;
    // (nothing to show yet, nor known how big it is: the first level asked for is on its way)
    if (!this.made.includes(true)) return;
    _eye.setFromMatrixPosition(camera.matrixWorld);
    _at.setFromMatrixPosition(this.matrixWorld);
    const ws = this.matrixWorld.getMaxScaleOnAxis();
    const d = Math.max(0.1, _eye.distanceTo(_at) - (this.o.radius ?? 0) * ws);
    const pixel = pixelOf(camera);
    const mpp = d * pixel;
    // (the metres the callers give hold at the reference pixel, and grow on a sharper picture)
    const e = d * Math.min(1, pixel / REF_PIXEL);
    const want = this.pick(mpp, e, ws);
    if (want < this.level) this.level = want;
    else if (want > this.level) {
      const held = this.pick(mpp / (1 + HOLD), e / (1 + HOLD), ws);
      if (held > this.level) this.level = held;
    }
    // (made ahead: the finer levels the camera may soon come to)
    const ahead = this.pick(mpp / AHEAD, e / AHEAD, ws);
    for (let i = ahead; i <= Math.min(this.level, n - 1); i++) this.want(i);
    this.show();
  }

  /** The level for a pixel of `mpp` m at the piece, a distance `e` (m, at the reference) and a world scale `ws`: `specs.length` for none. */
  private pick(mpp: number, e: number, ws: number): number {
    const n = this.specs.length;
    const past = e >= FLOOR;
    if (e >= this.o.hide || (past && this.o.size * ws < HIDE_PX * mpp)) return n;
    const cs = this.unit * ws;
    let i = 0;
    for (let k = 1; k < n; k++) {
      const cell = this.specs[k].cell;
      // (a level they had keeps its metres; a coarser one waits for the floor and its cells)
      const ok = (k > 1 || this.o.near <= 0 || e >= this.o.near) && (cell <= 0 || (past && cell * cs <= SHARP_PX * mpp));
      if (!ok) break;
      i = k;
    }
    return i;
  }

  /** Shows the level asked for, or the nearest one made (the finer of two as near). */
  private show(): void {
    const n = this.specs.length;
    let s = this.forced >= 0 ? this.forced : this.level;
    if (s < n && !this.made[s]) {
      let found = n;
      for (let k = 1; k < n && found === n; k++) {
        if (s - k >= 0 && this.made[s - k]) found = s - k;
        else if (s + k < n && this.made[s + k]) found = s + k;
      }
      s = found;
    }
    for (let i = 0; i < n; i++) this.slots[i].visible = i === s;
  }

  /** Makes a level (once). */
  private want(i: number): void {
    if (this.asked[i]) return;
    this.asked[i] = true;
    const r = this.specs[i].load(this);
    if (r instanceof Promise) void trackSacred(r.then((obj) => this.place(i, obj)));
    else this.place(i, r);
  }

  private place(i: number, obj: Object3D): void {
    if (this.o.caster !== undefined)
      obj.traverse((m) => {
        if ((m as Mesh).isMesh) m.layers = new ViewLayers();
      });
    this.slots[i].add(obj);
    this.made[i] = true;
    if (i === this.o.caster) this.addCaster(obj);
    this.show();
  }

  /** The still-shadow stand-in: a copy of the level's mesh on the piece's layers but the camera's (see the file's note). */
  private addCaster(obj: Object3D): void {
    const c = obj.clone();
    c.name = `${this.name}:shadow`;
    const layers = this.layers.mask & ~1;
    c.traverse((m) => {
      m.layers.mask = layers;
      // (never picked: the bug report names the mesh shown)
      m.raycast = () => {};
      if ((m as Mesh).isMesh) m.castShadow = true;
    });
    this.add(c);
  }
}

/** Every piece's levels under `root`: always show level `i` (the preview: `-far`, `-mid`, `-coarse`). */
export function forceDetail(root: Object3D, i: number): void {
  root.traverse((o) => {
    if (o instanceof SacredLod) o.force(Math.min(i, o.levelCount - 1));
  });
}
