import {
  BoxGeometry,
  Color,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey, type VoxelMaterialSpec } from '../../voxel/materials';
import { VoxelBuilder, type VoxelBox } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh, openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { chamferOf, graphicsNow, markStill, paintRim, pixelSize, plainAt } from '../graphics';
import { glowMaterial, haloPoints, type Halo, type HaloUniforms } from '../road/glow';
import { GLOW } from '../village/_lights';
import './models';
import { buildPiece, PIECES, type Built, type PieceId } from './pieces';
import { BUILD } from './state';

/**
 * What he has built, on the map (roam/_build.ts adds `object` to roaming's
 * scene and calls `frame` every frame): each piece's model (build/models/,
 * the placeholder in pieces.ts until one is done) set on the land at its
 * place and turn.
 *
 * - **Few draws.** Every piece that stands is one batch (`stand`): its blocks
 *   in world metres in one builder, a mesh per block family (bark, leaf,
 *   petal, stone…: the map's own shaders), made again only when a piece comes
 *   to stand or is taken down. A piece under way is a small batch of its own
 *   (`rising`, a mesh per family of all its blocks), drawing only its first
 *   blocks in the model's order (`count` per family: the blocks a builder puts
 *   up first), so it rises block by block with nothing made a frame.
 * - **Far.** Once its blocks' cut edges span under a pixel where the batch
 *   comes nearest the camera they are drawn as plain boxes, their rims
 *   painted (graphics.ts `plainAt`, `paintRim`: the map's own rule); once a
 *   metre there spans under `HIDE_PX` pixels it is hidden. The plain level
 *   builds plain boxes.
 * - **Light.** The lamps' flames and the spirit house's candle (`PIECES[id].light`)
 *   glow at night (the village's lamp glow, road/glow.ts `glowMaterial('lamp')`:
 *   its program is the village's) with a soft halo (`haloPoints`), dim by day.
 *   A fixed pool of `MAX_LIGHTS`: nothing is made when one comes or goes.
 * - **Shadows**: cast and received, still (graphics.ts `markStill`): the still
 *   map is asked again after a change (at most once a second while a piece rises).
 *
 * `pieceLook(id, seed)`: a piece's blocks in its own frame (the ghost and the
 * work read them too), made once per kind and seed.
 */

/** A metre spans under this many pixels where the nearest piece is: hidden. */
const HIDE_PX = 0.9;
/** The still shadows asked again at most this often while a piece rises (s). */
const SHADOW_EVERY = 1;
/** Lamps and candles at most (8 lamps, the spirit house's candle, spare). */
const MAX_LIGHTS = 12;
/** A light's glowing block (m: across, high) and its halo (m), by piece. */
const LIGHT: Partial<Record<PieceId, { w: number; h: number; halo: number; color: number }>> = {
  // (over the model's own opaque globe and flame: build/models/lamp.ts's globe 0.18 m across its belly, 0.22 m high;
  // spirit.ts's flame 0.022 × 0.044 m; two blocks a light, square and turned 45°: an octagon round it)
  lamp: { w: 0.2, h: 0.235, halo: 1.7, color: GLOW.lantern },
  spirit: { w: 0.034, h: 0.066, halo: 0.75, color: 0xffb050 },
};

export interface PieceLookData {
  /** Its blocks in its own frame (pieces.ts: its middle on the ground, +z its front), in the order put up. */
  readonly boxes: readonly VoxelBox[];
  /** Its top (m) and how far it reaches from its middle (m). */
  readonly top: number;
  readonly reach: number;
}

const looks = new Map<string, PieceLookData>();
/** Checks: the models are drawn again (`__build.rebuild()` after a model changed). */
export function forgetLooks(): void {
  looks.clear();
}

/** A piece's blocks in its own frame (made once per kind and seed). */
export function pieceLook(id: PieceId, seed: number): PieceLookData {
  const key = `${id}|${seed.toFixed(4)}`;
  let l = looks.get(key);
  if (l) return l;
  const b = new VoxelBuilder();
  try {
    buildPiece(b, { id, seed });
  } catch (e) {
    console.error(`[build] the ${id} model failed:`, e);
  }
  let top = PIECES[id].h;
  let reach = Math.hypot(PIECES[id].w, PIECES[id].d) / 2;
  for (const x of b.boxes) {
    top = Math.max(top, x.y + x.sy / 2);
    reach = Math.max(reach, Math.hypot(x.x, x.z) + Math.max(x.sx, x.sz) / 2);
  }
  l = { boxes: b.boxes, top, reach };
  looks.set(key, l);
  return l;
}

const _q = new Quaternion();
const _qy = new Quaternion();
const _e = new Euler();
const _up = new Vector3(0, 1, 0);

/** A piece's blocks set on the map (its place and turn) into `out`. */
function putInWorld(p: Built, look: PieceLookData, out: VoxelBuilder): void {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  _qy.setFromAxisAngle(_up, p.yaw);
  for (const b of look.boxes) {
    const w: VoxelBox = { ...b, x: p.x + b.x * c + b.z * s, y: p.y + b.y, z: p.z - b.x * s + b.z * c };
    if (b.rx || b.rz) {
      _q.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0, 'XYZ'));
      _q.premultiply(_qy);
      _e.setFromQuaternion(_q, 'XYZ');
      w.rx = _e.x;
      w.ry = _e.y;
      w.rz = _e.z;
    } else w.ry = (b.ry ?? 0) + p.yaw;
    out.boxes.push(w);
  }
}

/** A batch's meshes: each with its family's cut block and plain box (swapped far off), and its largest cut edge. */
interface Mesh {
  readonly mesh: InstancedMesh;
  readonly mat: VoxelMaterialKey;
  readonly cut: BufferGeometry;
  readonly box: BufferGeometry;
  edge: number;
  plain: boolean;
}

interface Batch {
  readonly group: Group;
  readonly meshes: Mesh[];
  /** Round its pieces (m). */
  readonly sphere: Sphere;
  hidden: boolean;
  plain: boolean;
}

/** A piece under way: its batch, its blocks' family index in order, the blocks shown so far. */
interface Rising {
  readonly piece: Built;
  readonly batch: Batch;
  /** Per mesh, how many of its blocks are among the first n of the piece (`pre[m][n]`). */
  readonly pre: Uint16Array[];
  readonly total: number;
  shown: number;
}

export interface BuildView {
  readonly object: Group;
  /** The batch of the pieces that stand (the hammock add-on reads its `petal` blocks): stable, its meshes change. */
  readonly standing: Group;
  /** What changed made now (the batches, the lights), without a camera: before the first frame, a check. */
  sync(): void;
  /** Every frame: the camera that draws it, seconds, how dark it is (0 day ‥ 1 night). */
  frame(camera: Camera, t: number, dt: number, night: number): void;
  /** Called after the standing batch is made again (its blocks moved: the hammocks are read again). */
  onStanding(fn: () => void): void;
  /** How many blocks of a piece under way are drawn (checks), or −1. */
  shownOf(uid: string): number;
  stats(): { standing: number; blocks: number; draws: number; rising: number; lights: number; hidden: boolean; plain: boolean; ms: number };
  /** Everything made again (a model changed). */
  rebuild(): void;
}

export function createBuildView(shot = false): BuildView {
  const object = new Group();
  object.name = 'build';
  const standing = new Group();
  standing.name = 'build:standing';
  object.add(standing);
  let stand: Batch | null = null;
  const rising = new Map<string, Rising>();
  let standDirty = true;
  const standListeners: (() => void)[] = [];
  let quality: 'low' | 'medium' = graphicsNow.plainBlocks ? 'low' : 'medium';
  const stats = { standing: 0, blocks: 0, draws: 0, rising: 0, lights: 0, hidden: false, plain: false, ms: 0 };
  /** The still shadows: asked again from the next mesh drawn (`shadowWant` once a second while a piece rises). */
  let shadowAsk = false;
  let shadowWant = false;
  let shadowAt = -Infinity;
  const askShadow = (renderer: WebGLRenderer) => {
    if (!shadowAsk) return;
    shadowAsk = false;
    renderer.shadowMap.needsUpdate = true;
  };

  function makeBatch(b: VoxelBuilder, name: string): Batch {
    const group = buildVoxelMesh(b, { quality, name, castShadow: true, receiveShadow: true });
    const meshes: Mesh[] = [];
    for (const o of group.children) {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh) continue;
      const mat = mesh.name.slice(mesh.name.lastIndexOf(':') + 1) as VoxelMaterialKey;
      const spec = VOXEL_MATERIALS[mat] as VoxelMaterialSpec;
      const flat = spec.chamfer ?? false;
      // (this view swaps its own far shapes: graphics.ts `setGraphics` leaves it be)
      delete mesh.userData.voxelShape;
      mesh.onBeforeRender = askShadow;
      meshes.push({ mesh, mat, cut: unitVoxelGeometry(spec.bevel, quality === 'low' ? 0 : 1, flat), box: unitVoxelGeometry(spec.bevel, 0), edge: chamferOf(mesh), plain: quality === 'low' });
    }
    markStill(group);
    const sphere = new Sphere();
    return { group, meshes, sphere, hidden: false, plain: quality === 'low' };
  }

  function dropBatch(b: Batch | null): void {
    if (!b) return;
    for (const m of b.meshes) paintRim(m.mesh, false);
    b.group.removeFromParent();
    disposeVoxelMesh(b.group);
  }

  /** The sphere round some pieces (their reach). */
  function sphereOf(ps: readonly Built[], out: Sphere): Sphere {
    out.makeEmpty();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of ps) {
      const l = pieceLook(p.id, p.seed);
      x0 = Math.min(x0, p.x - l.reach);
      x1 = Math.max(x1, p.x + l.reach);
      z0 = Math.min(z0, p.z - l.reach);
      z1 = Math.max(z1, p.z + l.reach);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y + l.top);
    }
    if (x1 < x0) return out;
    out.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    out.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    return out;
  }

  /** The standing batch made again (every piece that stands). */
  function rebuildStanding(): void {
    standDirty = false;
    const t0 = performance.now();
    dropBatch(stand);
    stand = null;
    const ps = BUILD.list.filter((p) => p.done >= 1);
    stats.standing = ps.length;
    if (ps.length) {
      const b = new VoxelBuilder();
      for (const p of ps) putInWorld(p, pieceLook(p.id, p.seed), b);
      stand = makeBatch(b, 'build:standing');
      sphereOf(ps, stand.sphere);
      standing.add(stand.group);
      stats.blocks = b.boxes.length;
    } else stats.blocks = 0;
    stats.draws = stand?.meshes.length ?? 0;
    stats.ms = +(performance.now() - t0).toFixed(1);
    shadowAsk = true;
    lightsDirty = true;
    for (const fn of standListeners) fn();
  }

  /** A piece under way: its own batch, drawing its first blocks. */
  function makeRising(p: Built): Rising {
    const look = pieceLook(p.id, p.seed);
    const b = new VoxelBuilder();
    putInWorld(p, look, b);
    const batch = makeBatch(b, `build:rising:${p.uid}`);
    sphereOf([p], batch.sphere);
    object.add(batch.group);
    const n = look.boxes.length;
    const pre = batch.meshes.map((m) => {
      const a = new Uint16Array(n + 1);
      let k = 0;
      for (let i = 0; i < n; i++) {
        if (look.boxes[i].mat === m.mat) k++;
        a[i + 1] = k;
      }
      return a;
    });
    const r: Rising = { piece: p, batch, pre, total: n, shown: -1 };
    show(r);
    return r;
  }

  /** Draw the first blocks of a piece under way (as far as it is built). */
  function show(r: Rising): void {
    // (the first block as soon as the work begins: the posts go up first)
    const n = Math.min(r.total, Math.ceil(r.piece.done * r.total - 1e-6));
    if (n === r.shown) return;
    r.shown = n;
    r.batch.meshes.forEach((m, i) => (m.mesh.count = r.pre[i][n]));
    shadowWant = true;
  }

  function syncRising(): void {
    for (const [uid, r] of rising)
      if (r.piece.done >= 1 || !BUILD.list.includes(r.piece)) {
        dropBatch(r.batch);
        rising.delete(uid);
      }
    for (const p of BUILD.list) if (p.done < 1 && !rising.has(p.uid)) rising.set(p.uid, makeRising(p));
    stats.rising = rising.size;
  }

  BUILD.on((e) => {
    if (e.type === 'progress') {
      const r = rising.get(e.piece.uid);
      if (r) show(r);
      return;
    }
    if (e.type === 'done' || (e.type === 'removed' && e.piece.done >= 1) || (e.type === 'added' && e.piece.done >= 1)) standDirty = true;
    risingDirty = true;
    lightsDirty = true;
  });
  let risingDirty = true;

  // ── Lights ─────────────────────────────────────────────────────────────────
  const { material: glowMat, uniforms: glowU } = glowMaterial('lamp');
  glowMat.name = 'build:glow';
  const glowGeo = new BoxGeometry(1, 1, 1);
  const glows = new InstancedMesh(glowGeo, glowMat, MAX_LIGHTS * 2);
  glows.name = 'build:glows';
  glows.count = 0;
  glows.castShadow = glows.receiveShadow = false;
  glows.frustumCulled = false;
  const glowA = new Float32Array(MAX_LIGHTS * 4);
  glowGeo.setAttribute('aGlow', new InstancedBufferAttribute(glowA, 2));
  glows.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_LIGHTS * 6), 3);
  // (one tiny block far under the land on the first frames: its program is compiled with the map's)
  glows.setMatrixAt(0, new Matrix4().makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
  glows.count = 1;
  object.add(glows);
  const haloList: Halo[] = Array.from({ length: MAX_LIGHTS }, (_, i) => ({ x: 0, y: -500, z: 0, size: 0, kind: 0 as const, phase: i * 1.3 }));
  const halo = haloPoints(haloList);
  halo.points.name = 'build:halos';
  (halo.uniforms as HaloUniforms).uColor.value.setRGB(1, 0.66, 0.32);
  halo.points.frustumCulled = false;
  object.add(halo.points);
  const haloPos = halo.points.geometry.getAttribute('position') as BufferAttribute;
  const haloSize = halo.points.geometry.getAttribute('aSize') as BufferAttribute;
  let lightsDirty = true;
  const _m = new Matrix4();
  const _p = new Vector3();
  const _s = new Vector3();
  const _c = new Color();

  function syncLights(): void {
    lightsDirty = false;
    let n = 0;
    for (const p of BUILD.list) {
      const spec = PIECES[p.id];
      const L = LIGHT[p.id];
      if (!spec.light || !L || p.done < 1 || n >= MAX_LIGHTS) continue;
      const [lx, ly, lz] = spec.light;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const x = p.x + lx * c + lz * s;
      const y = p.y + ly;
      const z = p.z - lx * s + lz * c;
      _qy.setFromAxisAngle(_up, p.yaw);
      for (let k = 0; k < 2; k++) {
        const i = n * 2 + k;
        if (k) _qy.setFromAxisAngle(_up, p.yaw + Math.PI / 4);
        glows.setMatrixAt(i, _m.compose(_p.set(x, y, z), _qy, _s.set(L.w, L.h, L.w)));
        glows.setColorAt(i, _c.setHex(L.color));
        glowA[i * 2] = p.seed * 20;
        glowA[i * 2 + 1] = L.w;
      }
      haloPos.setXYZ(n, x, y, z);
      haloSize.setX(n, L.halo);
      n++;
    }
    for (let i = n; i < MAX_LIGHTS; i++) {
      haloPos.setXYZ(i, 0, -500, 0);
      haloSize.setX(i, 0);
    }
    stats.lights = n;
    glows.count = Math.max(1, n * 2);
    if (!n) glows.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    // (no light built: neither is drawn, two draws a frame saved wherever he is on the map; hidden, their programs are
    // still compiled with the map's before Start: three's compile walks hidden objects too, lazy.ts `compileFor`)
    glows.visible = halo.points.visible = n > 0;
    glows.instanceMatrix.needsUpdate = true;
    if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
    (glowGeo.getAttribute('aGlow') as BufferAttribute).needsUpdate = true;
    haloPos.needsUpdate = true;
    haloSize.needsUpdate = true;
  }

  // ── Far ────────────────────────────────────────────────────────────────────
  const _eye = new Vector3();
  /** Hidden when small, plain boxes when its cut edges are under a pixel (the map's rule). */
  function judge(b: Batch, pixel: number): void {
    const d = Math.max(0, b.sphere.center.distanceTo(_eye) - b.sphere.radius);
    const hide = d * pixel > 1 / HIDE_PX;
    if (hide !== b.hidden) {
      b.hidden = hide;
      b.group.visible = !hide;
    }
    if (hide || quality === 'low') return;
    let edge = 0;
    for (const m of b.meshes) edge = Math.max(edge, m.edge);
    const plain = plainAt(d, edge, pixel, b.plain);
    if (plain === b.plain) return;
    b.plain = plain;
    for (const m of b.meshes) {
      const unit = plain ? m.box : m.cut;
      const geo = m.mesh.geometry;
      geo.setIndex(openSidesIndex(unit, 63));
      geo.setAttribute('position', unit.getAttribute('position'));
      geo.setAttribute('normal', unit.getAttribute('normal'));
      paintRim(m.mesh, plain);
    }
  }

  const api: BuildView = {
    object,
    standing,
    sync() {
      const q: 'low' | 'medium' = graphicsNow.plainBlocks ? 'low' : 'medium';
      if (q !== quality) {
        quality = q;
        standDirty = true;
        for (const r of rising.values()) dropBatch(r.batch);
        rising.clear();
        risingDirty = true;
      }
      if (standDirty) rebuildStanding();
      if (risingDirty) {
        risingDirty = false;
        syncRising();
      }
      if (lightsDirty) syncLights();
    },
    frame(camera, t, _dt, night) {
      api.sync();
      _eye.setFromMatrixPosition(camera.matrixWorld);
      const pixel = pixelSize(camera);
      if (stand) judge(stand, pixel);
      for (const r of rising.values()) judge(r.batch, pixel);
      // (the still shadows again after a piece rose a block, at most once a second)
      if (shadowWant && (shot || t - shadowAt >= SHADOW_EVERY)) {
        shadowWant = false;
        shadowAt = t;
        shadowAsk = true;
      }
      // The lights: dim by day (the dark lamp), bright at night, as the village's.
      const n = Math.min(1, Math.max(0, night));
      const k = n * n * (3 - 2 * n);
      glowU.uTime.value = t;
      glowU.uLevel.value = 0.07 + k * 3.1;
      glowU.uPulse.value = 0.03 + k * 0.05;
      glowU.uNearLevel.value = 1 - k * 0.5;
      const u = halo.uniforms;
      u.uTime.value = t;
      u.uScale.value = 1 / pixel;
      u.uLamp.value = k * k * 1.1;
    },
    onStanding(fn) {
      standListeners.push(fn);
    },
    shownOf(uid) {
      return rising.get(uid)?.shown ?? -1;
    },
    stats() {
      stats.hidden = stand?.hidden ?? false;
      stats.plain = stand?.plain ?? false;
      stats.draws = (stand?.meshes.length ?? 0) + [...rising.values()].reduce((a, r) => a + r.batch.meshes.length, 0);
      return { ...stats };
    },
    rebuild() {
      forgetLooks();
      standDirty = true;
      for (const r of rising.values()) dropBatch(r.batch);
      rising.clear();
      risingDirty = true;
      lightsDirty = true;
    },
  };
  return api;
}
