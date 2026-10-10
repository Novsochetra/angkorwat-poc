import { Box3, Group, Sphere, Vector3, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { frameCap, graphicsNow, markStill, pixelSize } from '../graphics';
import type { RoamWorld } from '../roam/types';
import { swayLeaves } from '../veg/sway';
import { GROWN, KINDS, type PlantKindId, type Stage } from './kinds';
import './models';
import { GARDEN, lookOf, lookSig, type Plant, type PlantLook } from './state';
import { dropBetween, dropMoves, type Drop } from './_viewDrop';
import { buildEarth, puddleLook, tintEarth, wetLook, type Earth } from './_viewEarth';
import { buildLook, FAMILIES, LookCache, type LookData } from './_viewLook';
import { Pool, type Run } from './_viewPool';

/**
 * The garden on the map (roam/_garden.ts adds `object` to roaming's scene and
 * calls `sync` and `frame` each frame): every plant's model (garden/look.ts)
 * set on the land at its place and turn, over its dug bed (a crop) or its
 * watering basin (a tree), the earth darker while wet (garden/_viewEarth.ts).
 *
 * **Few draws.** The plants of a site (his home garden; the pagoda's bodhi) are
 * one batch: a mesh per block family (garden/_viewPool.ts: leaves, bark,
 * petals, stone, earth, grass — six draws near, the map's own shaders), each
 * plant a run of instances in each. A plant whose look changes writes its own
 * runs again (its look's blocks built once and cached by `lookKey`:
 * garden/_viewLook.ts) and only those ranges go up; the rest stand as they are.
 * Builds are spread over frames (≈ 3 ms a frame at most; a shot builds all at
 * once). Nothing is allocated in a frame where nothing changes.
 *
 * **Far.** Each batch is judged against the camera (graphics.ts `pixelSize`):
 * near, every block; once its finest blocks (`DETAIL`) span under half a pixel
 * where the garden comes nearest (a whole pixel on the low level), plain far
 * shapes instead (each plant a crown or two and a trunk, its earth one box,
 * garden/_viewLook.ts `far`; four draws); crops, seedlings and the earth go once
 * a metre spans under `SMALL_PX` pixels, the trees once the biggest crown spans
 * under one. The overview sees only the trees, as plain shapes.
 *
 * **Alive.** Leaves sway as the village's (veg/sway.ts, the map's wind), the
 * near fade shows him through a crown (roam/_nearFade.ts: the map's leaf and
 * bark materials). A new plant grows up out of its earth (the bed dug first), a
 * stage eases from the size it was (no pop), a plant pulled out shrinks away
 * and its earth flattens, ripe fruit drops from the crown and bounces once
 * (garden/_viewDrop.ts), the earth darkens in half a second when watered and a
 * puddle stands in a basin, soaking in. Shadows: cast and received; still
 * (graphics.ts `markStill`) like the village's, the still map asked again
 * (`shadowMap.needsUpdate`) when the garden has changed.
 *
 * Checks: `window.__gardenView` (shots and the dev server): `stats()`,
 * `rebuild()` (every look built again: a model changed).
 */
export interface GardenView {
  readonly object: Group;
  /** The plants now (each frame; cheap when nothing changed). */
  sync(plants: readonly Plant[]): void;
  /** Every frame: what is far is hidden, the leaves sway (the camera, seconds). */
  frame(camera: Camera, t: number): void;
  dispose(): void;
}

/** The finest detail near shapes have (m: a stem, a small fruit) and the share of a pixel it spans when the far shapes take over. */
const DETAIL = 0.08;
const DETAIL_PX = 0.5;
/** Small things (crops, seedlings, the earth: about a metre) hide under this many pixels a metre. */
const SMALL_PX = 2.5;
/** A plant is small (far: with the crops) under this height (m). */
const SMALL_H = 2.6;
/** Hysteresis of the switches (a share of the distance). */
const HOLD = 0.06;
/** A frame's build time (ms) before the rest waits for the next frame. */
const BUDGET = 3;
/** Animations (s). */
const GROW_S = 0.75;
const BED_S = 0.3;
const EASE_S = 0.9;
const LEAVE_S = 0.45;
const FLAT_S = 0.55;
/** The earth's colour eases to its wetness in about half a second (time constant, s). */
const WET_TAU = 0.14;
/** The still shadows asked again at most this often (s). */
const SHADOW_EVERY = 0.5;

type Site = 'home' | 'pagoda';
const FAR_LEAF = 0;
const FAR_BARK = 1;
const FAR_SMALL = 2;
const FAR_EARTH = 3;

interface Batch {
  readonly at: Site;
  readonly group: Group;
  readonly near: Group;
  readonly far: Group;
  readonly farTrees: Group;
  readonly farSmall: Group;
  /** Near pools, as `FAMILIES`. */
  readonly pools: readonly Pool[];
  /** Far pools: tree crowns, trunks, small plants' crowns, the earth. */
  readonly farPools: readonly Pool[];
  readonly sphere: Sphere;
  readonly box: Box3;
  readonly items: Item[];
  boundsDirty: boolean;
  /** Its biggest far crown (m across), for when the trees hide. */
  maxCrown: number;
  /** Drawn with its far shapes now; its small far things, its far trees shown. */
  isFar: boolean;
  smallShown: boolean;
  treesShown: boolean;
}

interface Item {
  readonly id: number;
  /** The plant (null: pulled out, shrinking away). */
  plant: Plant | null;
  readonly kind: PlantKindId;
  readonly batch: Batch;
  readonly x: number;
  /** The ground under it (m). */
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly seed: number;
  sig: number;
  data: LookData | null;
  earth: Earth | null;
  earthStage: number;
  /** Runs: the look's per family (as `FAMILIES`), the earth's and the puddle's, the far ones. */
  readonly runs: (Run | null)[];
  rock: Run | null;
  pud: Run | null;
  readonly far: (Run | null)[];
  /** The far crown is with the small plants (true) or the trees. */
  small: boolean;
  /** Scale animation: what it does, its time, from what size. */
  mode: 0 | 1 | 2 | 3;
  t: number;
  from: number;
  /** The earth's grow (0‥1 up, then 1‥0 flattening when leaving). */
  earthUp: number;
  /** Wetness shown (eased), as last written; the puddle shown, as last written. */
  wet: number;
  wetW: number;
  pud0: number;
  pudW: number;
  earthC: Float32Array | null;
  readonly farEarthC: Float32Array;
  drop: Drop | null;
  stamp: number;
  queued: boolean;
}
const NONE = 0;
const GROW = 1;
const EASE = 2;
const LEAVE = 3;

const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
/** Up, a little past, and back (a plant pushing up out of the earth). */
const easeOutBack = (u: number) => {
  const c = 1.3;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};

const _eye = new Vector3();

export function createGardenView(world: RoamWorld, shot = false): GardenView {
  const object = new Group();
  object.name = 'garden';
  const cache = new LookCache();
  const items = new Map<number, Item>();
  const list: Item[] = [];
  const queue: Item[] = [];
  const falls = new Set<number>();
  let stamp = 0;
  /** The first plants are built (the ones there from the start appear as they are; later ones grow in). */
  let settled = false;
  let lastT = Number.NaN;
  /** The garden changed (the still shadows should be drawn again), and the ask to the next garden mesh drawn. */
  let shadowWant = false;
  let shadowAsk = false;
  let shadowAt = -Infinity;
  let now = 0;
  /** Checks: the animations slowed down (`__gardenView.slow(k)`). */
  let slow = 1;
  /** Checks: always near or far (`__gardenView.force`), else by the camera. */
  let force: 'near' | 'far' | null = new URLSearchParams(location.search).get('gardenlod') as 'near' | 'far' | null;
  const stats = { ahead: 0, warmMs: 0, builds: 0, buildMs: 0, maxMs: 0, lastMs: 0, frameMs: 0, maxFrameMs: 0, lookMs: 0, earthMs: 0, writeMs: 0 };

  // Ask the still shadows again once, from the first garden mesh drawn after a change.
  const askShadow = (renderer: WebGLRenderer) => {
    if (!shadowAsk) return;
    shadowAsk = false;
    renderer.shadowMap.needsUpdate = true;
  };

  function makeBatch(at: Site): Batch {
    const group = new Group();
    group.name = `garden:${at}`;
    const near = new Group();
    near.name = `garden:${at}:near`;
    const far = new Group();
    far.name = `garden:${at}:far`;
    const farTrees = new Group();
    const farSmall = new Group();
    far.add(farTrees, farSmall);
    far.visible = false;
    group.add(near, far);
    const sphere = new Sphere(new Vector3(), 0);
    const box = new Box3();
    const pools = FAMILIES.map((mat) => new Pool(mat, `garden:${at}`, false, mat === 'mapLeaf' ? 1024 : 256, sphere, box));
    for (const p of pools) near.add(p.mesh);
    const farPools = [
      new Pool('mapLeaf', `garden:${at}:far`, true, 64, sphere, box),
      new Pool('mapBark', `garden:${at}:far`, true, 64, sphere, box),
      new Pool('mapLeaf', `garden:${at}:farSmall`, true, 64, sphere, box),
      new Pool('mapRock', `garden:${at}:farEarth`, true, 64, sphere, box),
    ];
    farTrees.add(farPools[FAR_LEAF].mesh, farPools[FAR_BARK].mesh);
    farSmall.add(farPools[FAR_SMALL].mesh, farPools[FAR_EARTH].mesh);
    for (const p of [...pools, ...farPools]) p.mesh.onBeforeRender = askShadow;
    // Leaves sway as the village's (the near ones; the far crowns too, the same material); still shadows.
    swayLeaves(group, world.field);
    markStill(group);
    object.add(group);
    return { at, group, near, far, farTrees, farSmall, pools, farPools, sphere, box, items: [], boundsDirty: true, maxCrown: 0, isFar: false, smallShown: true, treesShown: true };
  }
  const batches: Record<Site, Batch> = { home: makeBatch('home'), pagoda: makeBatch('pagoda') };
  const batchList: readonly Batch[] = [batches.home, batches.pagoda];

  // Ripe fruit falling: the next look of that plant drops it from the crown.
  let alive = true;
  GARDEN.on((e) => {
    if (alive && e.type === 'fell') falls.add(e.plant.id);
  });

  // ── Writing a plant's blocks ──
  const A = new Float64Array(12);
  /** Where its plant blocks go: on its earth, turned, scaled by `s`. */
  const plantXf = (it: Item, s: number): Float64Array => {
    const c = Math.cos(it.yaw);
    const n = Math.sin(it.yaw);
    const k = Math.max(1e-3, s);
    A[0] = c * k;
    A[1] = 0;
    A[2] = -n * k;
    A[3] = 0;
    A[4] = k;
    A[5] = 0;
    A[6] = n * k;
    A[7] = 0;
    A[8] = c * k;
    A[9] = it.x;
    A[10] = it.y + (it.earth?.foot ?? 0) * Math.min(1, it.earthUp);
    A[11] = it.z;
    return A;
  };
  /** Where its earth's blocks go (square to the map): flattened by `up`, a little narrower as it rises or flattens; `p` the puddle's share. */
  const earthXf = (it: Item, p = 1): Float64Array => {
    const up = Math.max(1e-3, Math.min(1, it.earthUp) * p);
    const wide = Math.max(1e-3, (0.75 + 0.25 * Math.min(1, it.earthUp)) * p);
    A.fill(0);
    A[0] = wide;
    A[4] = up;
    A[8] = wide;
    A[9] = it.x;
    A[10] = it.y;
    A[11] = it.z;
    return A;
  };
  /** The plant's scale now (its animation). */
  const scaleOf = (it: Item): number => {
    if (it.mode === GROW) return easeOutBack(Math.min(1, Math.max(0, (it.t - BED_S * 0.6) / GROW_S)));
    if (it.mode === EASE) return it.from + (1 - it.from) * easeOutCubic(Math.min(1, it.t / EASE_S));
    if (it.mode === LEAVE) return 1 - Math.min(1, it.t / LEAVE_S) ** 2;
    return 1;
  };

  function writePlant(it: Item, attrs: boolean): void {
    const b = it.batch;
    const s = scaleOf(it);
    const a = plantXf(it, s);
    const d = it.data;
    if (!d) return;
    if (it.drop) dropMoves(it.drop, it.yaw, s);
    for (let fi = 0; fi < FAMILIES.length; fi++) {
      const f = d.fams[fi];
      const run = it.runs[fi];
      if (f && run) b.pools[fi].write(run, f, a, it.drop?.move[fi] ?? null, 0, f.n, attrs);
    }
    const leaf = it.far[it.small ? FAR_SMALL : FAR_LEAF];
    if (d.far.leaf && leaf) b.farPools[it.small ? FAR_SMALL : FAR_LEAF].write(leaf, d.far.leaf, a, null, 0, d.far.leaf.n, attrs);
    const bark = it.far[FAR_BARK];
    if (d.far.bark && bark) b.farPools[FAR_BARK].write(bark, d.far.bark, a, null, 0, d.far.bark.n, attrs);
  }

  function writeEarth(it: Item, attrs: boolean): void {
    const e = it.earth;
    const b = it.batch;
    if (!e) return;
    if (it.rock) b.pools[ROCK].write(it.rock, e.rock, earthXf(it), null, 0, e.rock.n, attrs);
    if (it.far[FAR_EARTH]) b.farPools[FAR_EARTH].write(it.far[FAR_EARTH]!, e.far, earthXf(it), null, 0, 1, attrs);
    if (e.puddle && it.pud) b.pools[STONE].write(it.pud, e.puddle, earthXf(it, Math.max(1e-3, it.pud0)), null, 0, e.puddle.n, attrs);
    it.pudW = it.pud0;
    if (attrs) tint(it);
  }

  /** The earth's colours for the wetness shown. */
  function tint(it: Item): void {
    const e = it.earth;
    if (!e || !it.rock) return;
    it.earthC ??= new Float32Array(e.rock.n * 3);
    if (it.earthC.length !== e.rock.n * 3) it.earthC = new Float32Array(e.rock.n * 3);
    tintEarth(e, it.wet, it.earthC, it.farEarthC);
    it.batch.pools[ROCK].colors(it.rock, it.earthC);
    const fe = it.far[FAR_EARTH];
    if (fe) it.batch.farPools[FAR_EARTH].colors(fe, it.farEarthC);
    it.wetW = it.wet;
  }

  const ROCK = FAMILIES.indexOf('mapRock');
  const STONE = FAMILIES.indexOf('mapStone');

  // ── Building ──
  function build(it: Item): void {
    const t0 = performance.now();
    const p = it.plant;
    if (!p) return;
    const b = it.batch;
    const look = lookOf(p);
    const fresh = cache.size;
    const next = cache.take(look);
    const t1 = performance.now();
    if (cache.size !== fresh || next.ms > 0) stats.lookMs = Math.max(stats.lookMs, t1 - t0);
    const prev = it.data;
    const k = KINDS[it.kind];
    // Its earth: a crop's bed once; a tree's basin as the tree grows.
    const band = k.size === 'crop' ? 0 : look.stage;
    if (!it.earth || it.earthStage !== band) {
      it.earth = buildEarth(it.kind, look.stage, it.seed, it.x, it.y, it.z, world.groundAt);
      it.earthStage = band;
      it.rock = b.pools[ROCK].fit(it.rock, it.earth.rock.n);
      it.pud = b.pools[STONE].fit(it.pud, it.earth.puddle?.n ?? 0);
      it.far[FAR_EARTH] = b.farPools[FAR_EARTH].fit(it.far[FAR_EARTH], 1);
    }
    const t2 = performance.now();
    stats.earthMs = Math.max(stats.earthMs, t2 - t1);
    // Its look's runs.
    for (let fi = 0; fi < FAMILIES.length; fi++) it.runs[fi] = b.pools[fi].fit(it.runs[fi], next.fams[fi]?.n ?? 0);
    const small = k.size === 'crop' || next.height < SMALL_H;
    if (small !== it.small) {
      it.far[FAR_LEAF] = b.farPools[FAR_LEAF].fit(it.far[FAR_LEAF], 0);
      it.far[FAR_SMALL] = b.farPools[FAR_SMALL].fit(it.far[FAR_SMALL], 0);
      it.small = small;
    }
    it.far[small ? FAR_SMALL : FAR_LEAF] = b.farPools[small ? FAR_SMALL : FAR_LEAF].fit(it.far[small ? FAR_SMALL : FAR_LEAF], next.far.leaf?.n ?? 0);
    it.far[FAR_BARK] = b.farPools[FAR_BARK].fit(it.far[FAR_BARK], next.far.bark?.n ?? 0);
    // How it comes: grows in (new), eases from the size it was (a new stage), drops its fruit.
    const live = settled && !shot;
    if (!prev) {
      if (live) {
        it.mode = GROW;
        it.t = 0;
        it.earthUp = 0;
      }
    } else if (live && next.look.stage > prev.look.stage && prev.height > 0 && next.height > 0) {
      it.mode = EASE;
      it.t = 0;
      it.from = Math.min(1, Math.max(0.25, prev.height / next.height));
    }
    it.drop = null;
    if (prev && falls.has(it.id)) {
      falls.delete(it.id);
      if (live) it.drop = dropBetween(prev, next);
    }
    if (prev) cache.release(prev);
    it.data = next;
    const t3 = performance.now();
    writePlant(it, true);
    writeEarth(it, true);
    stats.writeMs = Math.max(stats.writeMs, performance.now() - t3);
    b.boundsDirty = true;
    if (!it.mode && !it.drop) shadowWant = true;
    const ms = performance.now() - t0;
    stats.builds++;
    stats.buildMs += ms;
    stats.lastMs = ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
  }

  function release(it: Item): void {
    const b = it.batch;
    for (let fi = 0; fi < FAMILIES.length; fi++) it.runs[fi] = b.pools[fi].fit(it.runs[fi], 0);
    it.rock = b.pools[ROCK].fit(it.rock, 0);
    it.pud = b.pools[STONE].fit(it.pud, 0);
    for (let k = 0; k < it.far.length; k++) it.far[k] = b.farPools[k].fit(it.far[k], 0);
    if (it.data) cache.release(it.data);
    it.data = null;
    items.delete(it.id);
    list.splice(list.indexOf(it), 1);
    b.items.splice(b.items.indexOf(it), 1);
    b.boundsDirty = true;
    shadowWant = true;
  }

  function newItem(p: Plant): Item {
    const batch = batches[p.at === 'pagoda' ? 'pagoda' : 'home'];
    const it: Item = {
      id: p.id,
      plant: p,
      kind: p.kind,
      batch,
      x: p.x,
      y: world.groundAt(p.x, p.z),
      z: p.z,
      yaw: p.yaw,
      seed: p.seed,
      sig: -1,
      data: null,
      earth: null,
      earthStage: -1,
      runs: FAMILIES.map(() => null),
      rock: null,
      pud: null,
      far: [null, null, null, null],
      small: true,
      mode: NONE,
      t: 0,
      from: 1,
      earthUp: 1,
      wet: wetLook(p.wet),
      wetW: -1,
      pud0: puddleLook(p.wet),
      pudW: -1,
      earthC: null,
      farEarthC: new Float32Array(3),
      drop: null,
      stamp,
      queued: false,
    };
    items.set(p.id, it);
    list.push(it);
    batch.items.push(it);
    return it;
  }

  /** The batch's bounds (its plants, their heights and reach), and where its holes are parked. */
  function fitBounds(b: Batch): void {
    b.boundsDirty = false;
    const c = b.sphere.center.set(0, 0, 0);
    const n = b.items.length;
    b.box.makeEmpty();
    b.maxCrown = 0;
    if (!n) {
      b.sphere.radius = 0;
      return;
    }
    for (const it of b.items) c.x += it.x / n;
    for (const it of b.items) c.z += it.z / n;
    let lo = Infinity;
    let hi = -Infinity;
    let r = 0;
    for (const it of b.items) {
      const h = (it.data?.height ?? 1) + (it.earth?.foot ?? 0);
      const reach = Math.max(it.data?.reach ?? 1, it.earth?.reach ?? 0, 0.5) + 0.3;
      lo = Math.min(lo, it.y - 0.2);
      hi = Math.max(hi, it.y + h + 0.3);
      r = Math.max(r, Math.hypot(it.x - c.x, it.z - c.z) + reach);
      b.box.expandByPoint(_eye.set(it.x - reach, it.y - 0.2, it.z - reach));
      b.box.expandByPoint(_eye.set(it.x + reach, it.y + h + 0.3, it.z + reach));
      if (it.data?.far.leaf && !it.small) b.maxCrown = Math.max(b.maxCrown, it.data.reach * 2);
    }
    c.y = (lo + hi) / 2;
    b.sphere.radius = Math.hypot(r, (hi - lo) / 2);
    for (const p of [...b.pools, ...b.farPools]) p.park = { x: c.x, y: lo, z: c.z };
  }

  /** Each frame: how the batch is drawn for this camera (near, far, what of it far). */
  function judge(b: Batch, camera: Camera): void {
    const n = b.items.length;
    b.group.visible = n > 0;
    if (!n) return;
    _eye.setFromMatrixPosition(camera.matrixWorld);
    const d = Math.max(0.01, _eye.distanceTo(b.sphere.center) - b.sphere.radius);
    const px = pixelSize(camera);
    const want = (graphicsNow.plainBlocks ? 1 : DETAIL_PX) / (1 + (b.isFar ? 0 : HOLD));
    const far = force ? force === 'far' : DETAIL / (d * px) < want;
    const small = !far || 1 / (d * px) >= SMALL_PX / (b.smallShown ? 1 + HOLD : 1);
    const trees = !far || b.maxCrown / (d * px) >= 1 / (b.treesShown ? 1 + HOLD : 1);
    b.isFar = far;
    b.smallShown = small;
    b.treesShown = trees;
    b.near.visible = !far;
    b.far.visible = far;
    b.farSmall.visible = far && small;
    b.farTrees.visible = far && trees;
  }

  function flushAll(): void {
    for (let i = 0; i < batchList.length; i++) {
      const b = batchList[i];
      if (b.boundsDirty) fitBounds(b);
      for (const p of b.pools) p.flush();
      for (const p of b.farPools) p.flush();
    }
  }

  // ── Looks built ahead, so a plant about to grow a stage or ripen finds its next look built: the change then
  // costs a write, not its model's build. In the browser's idle time (`requestIdleCallback`); where there is none
  // (Safari), one look at a time in a timeout between frames, only while the frames keep to their rate ──
  type Idle = (cb: (d: { timeRemaining(): number }) => void) => number;
  /** (checks: `__gardenView.noIdle()` as Safari, the timeout's way) */
  let idleCall = (globalThis as unknown as { requestIdleCallback?: Idle }).requestIdleCallback?.bind(globalThis);
  let idleWaiting = false;
  let idleAt = 0;
  /** Its looks to come soon (the next stage within a tenth of its way; ripe fruit coming; fruit about to fall). */
  function nextLooks(it: Item, out: PlantLook[]): void {
    const p = it.plant;
    const d = it.data;
    if (!p || !d || p.dead) return;
    const k = KINDS[it.kind];
    const l = d.look;
    const base = { kind: l.kind, stage: l.stage, fruit: 0 as 0 | 1 | 2, fallen: l.fallen, droop: 0 as const, dead: false, cut: l.cut, seed: l.seed };
    if (l.stage < GROWN) {
      const at = l.stage < 3 ? k.stageAt[l.stage as 0 | 1 | 2] : 1;
      if (p.age / k.growDays > at - 0.1) out.push({ ...base, stage: (l.stage + 1) as Stage, fallen: 0 });
      return;
    }
    if (k.fruit.count[1] <= 0 || p.ripe < 0.25) return;
    if (k.fruit.pick === 'ground') {
      if (p.ripe > 0.75 && !l.fallen) for (let n = k.fruit.count[0]; n <= Math.min(3, k.fruit.count[1]); n++) if (n > 0) out.push({ ...base, fallen: n });
    } else if (l.fruit < 2) out.push({ ...base, fruit: (l.fruit + 1) as 1 | 2 });
  }
  const ahead: PlantLook[] = [];
  /** Build the next look to come that is not built yet (round the garden from where the last one stopped): false if none. */
  function warmNext(): boolean {
    for (let n = 0; n < list.length; n++) {
      const it = list[idleAt++ % list.length];
      ahead.length = 0;
      nextLooks(it, ahead);
      for (const l of ahead) if (cache.warm(l)) {
        stats.ahead++;
        return true;
      }
    }
    return false;
  }
  function idle(d: { timeRemaining(): number }): void {
    idleWaiting = false;
    if (!alive || !list.length) return;
    while (d.timeRemaining() > 9 && warmNext());
  }
  /** Frames in a row that kept to the frame rate (the timeout's way), and when it last built one (s). */
  let smooth = 0;
  let aheadAt = -Infinity;
  const timeoutStep = () => {
    idleWaiting = false;
    if (alive && list.length && warmNext()) aheadAt = now;
  };

  // ── Every model's code run once now (roaming waits for the add-ons: this is before the first frame of play), so
  // no model's first build (the JIT's first compile of its code, tens of ms) lands in a frame of play ──
  if (!shot) {
    const t0 = performance.now();
    const looks: Omit<PlantLook, 'kind'>[] = [];
    const L = (stage: Stage, more: Partial<PlantLook> = {}) => looks.push({ stage, fruit: 0, fallen: 0, droop: 0, dead: false, cut: false, seed: 0.5, ...more });
    for (let st = 0; st <= 4; st++) L(st as Stage);
    L(4, { fruit: 1 });
    L(4, { fruit: 2, cut: true });
    L(4, { fallen: 2 });
    L(2, { droop: 2 });
    L(1, { dead: true });
    for (const kind of Object.keys(KINDS) as PlantKindId[])
      for (const l of looks)
        try {
          buildLook({ ...l, kind });
        } catch (e) {
          console.warn(`[garden] the ${kind} model failed to build (stage ${l.stage}):`, e);
        }
    stats.warmMs = performance.now() - t0;
    console.info(`[garden] every plant's model run once in ${stats.warmMs.toFixed(0)} ms (before play: no first build in a frame of play)`);
  }

  const view: GardenView = {
    object,
    sync(plants) {
      stamp++;
      for (let i = 0; i < plants.length; i++) {
        const p = plants[i];
        let it = items.get(p.id);
        if (!it || !it.plant) {
          // (a plant pulled out and planted again under its id cannot be: ids are never used twice)
          if (it) continue;
          it = newItem(p);
        }
        it.stamp = stamp;
        it.plant = p;
        const sig = lookSig(p);
        if (sig !== it.sig) {
          it.sig = sig;
          if (!it.queued) {
            it.queued = true;
            queue.push(it);
          }
        }
        // (the earth's wetness: eased in `frame`)
      }
      // Gone from the garden: shrinks away (or at once, in a shot or before anything was seen).
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (it.stamp === stamp || !it.plant) continue;
        it.plant = null;
        if (settled && !shot && it.data) {
          it.mode = LEAVE;
          it.t = 0;
          it.drop = null;
        } else release(it);
      }
      // Build what changed, a few milliseconds a frame (all of it in a shot).
      const t0 = performance.now();
      while (queue.length) {
        const it = queue.shift()!;
        it.queued = false;
        if (it.plant) build(it);
        if (!shot && performance.now() - t0 > BUDGET) break;
      }
      if (!queue.length) settled = true;
      if (settled && !shot && !idleWaiting) {
        if (idleCall) {
          idleWaiting = true;
          idleCall(idle);
        } else if (smooth >= 12 && now - aheadAt > 0.3) {
          idleWaiting = true;
          setTimeout(timeoutStep, 0);
        }
      }
    },
    frame(camera, t) {
      const t0 = performance.now();
      const real = Number.isNaN(lastT) ? 0 : t - lastT;
      const dt = shot ? 0 : Math.min(0.1, Math.max(0, real)) * slow;
      smooth = real > 0 && real <= frameCap.time * 1.3 ? smooth + 1 : 0;
      lastT = t;
      now += dt;
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (!it.data) continue;
        let moved = false;
        if (it.mode || it.earthUp < 1) {
          it.t += dt;
          if (it.mode === GROW) {
            it.earthUp = Math.min(1, it.t / BED_S);
            if (it.t >= BED_S * 0.6 + GROW_S) it.mode = NONE;
          } else if (it.mode === EASE) {
            if (it.t >= EASE_S) it.mode = NONE;
          } else if (it.mode === LEAVE) {
            it.earthUp = 1 - Math.min(1, Math.max(0, (it.t - LEAVE_S * 0.5) / FLAT_S));
            if (it.t >= LEAVE_S * 0.5 + FLAT_S) {
              release(it);
              continue;
            }
          } else it.earthUp = 1;
          moved = true;
          if (!it.mode && it.earthUp >= 1) shadowWant = true;
        }
        if (it.drop) {
          it.drop.t += dt;
          if (it.drop.t >= it.drop.end) {
            dropMoves(it.drop, it.yaw, 1);
            it.drop = null;
            shadowWant = true;
          }
          moved = true;
        }
        if (moved) {
          writePlant(it, false);
          writeEarth(it, false);
        }
        // The earth's water: darker in half a second when watered, paler as it dries; the puddle soaking in.
        const p = it.plant;
        if (p && it.earth) {
          const w = wetLook(p.wet);
          it.wet = dt > 0 && Math.abs(w - it.wet) > 0.003 ? it.wet + (w - it.wet) * (1 - Math.exp(-dt / WET_TAU)) : w;
          if (it.wet !== it.wetW && (Math.abs(it.wet - it.wetW) > 0.01 || it.wet === w)) tint(it);
          const pd = it.earth.puddle ? puddleLook(p.wet) : 0;
          it.pud0 = dt > 0 && Math.abs(pd - it.pud0) > 0.003 ? it.pud0 + (pd - it.pud0) * (1 - Math.exp(-dt / WET_TAU)) : pd;
          if (it.pud && it.pud0 !== it.pudW && (Math.abs(it.pud0 - it.pudW) > 0.01 || it.pud0 === pd)) {
            it.batch.pools[STONE].write(it.pud, it.earth.puddle!, earthXf(it, Math.max(1e-3, it.pud0)), null, 0, it.earth.puddle!.n, false);
            it.pudW = it.pud0;
          }
        }
      }
      flushAll();
      judge(batches.home, camera);
      judge(batches.pagoda, camera);
      // (only the still shadows of low and medium need asking: the others are drawn every few frames)
      if (shadowWant && (now - shadowAt >= SHADOW_EVERY || dt === 0)) {
        shadowWant = false;
        shadowAsk = graphicsNow.stillShadows;
        shadowAt = now;
      }
      const ms = performance.now() - t0;
      stats.frameMs = ms;
      stats.maxFrameMs = Math.max(stats.maxFrameMs, ms);
    },
    dispose() {
      alive = false;
      for (const b of Object.values(batches)) for (const p of [...b.pools, ...b.farPools]) p.dispose();
      object.clear();
      cache.clear();
      items.clear();
      list.length = 0;
    },
  };

  if (shot || import.meta.env.DEV)
    Object.assign(window, {
      __gardenView: {
        stats: () => {
          const pools = (o: Object3D) => {
            const out: Record<string, string> = {};
            o.traverse((m) => {
              const mesh = m as unknown as { isInstancedMesh?: boolean; count: number; name: string };
              if (mesh.isInstancedMesh) out[mesh.name] = `${mesh.count}`;
            });
            return out;
          };
          let blocks = 0;
          for (const it of list) blocks += it.data?.blocks ?? 0;
          const draws: string[] = [];
          object.traverseVisible((o) => {
            const m = o as unknown as { isInstancedMesh?: boolean; count: number; name: string };
            if (m.isInstancedMesh && m.count > 0) draws.push(m.name);
          });
          return {
            plants: list.length,
            blocks,
            queued: queue.length,
            looks: cache.size,
            ahead: stats.ahead,
            warmMs: +stats.warmMs.toFixed(1),
            build: { n: stats.builds, avgMs: +(stats.buildMs / Math.max(1, stats.builds)).toFixed(3), maxMs: +stats.maxMs.toFixed(3), lastMs: +stats.lastMs.toFixed(3) },
            frame: { ms: +stats.frameMs.toFixed(3), maxMs: +stats.maxFrameMs.toFixed(3) },
            parts: { lookMs: +stats.lookMs.toFixed(3), earthMs: +stats.earthMs.toFixed(3), writeMs: +stats.writeMs.toFixed(3) },
            lod: Object.fromEntries(Object.values(batches).map((b) => [b.at, { far: b.isFar, small: b.smallShown, trees: b.treesShown, r: +b.sphere.radius.toFixed(1), maxCrown: +b.maxCrown.toFixed(2) }])),
            draws,
            pools: pools(object),
          };
        },
        noIdle: () => {
          idleCall = undefined;
        },
        force: (f: 'near' | 'far' | null) => {
          force = f;
        },
        slow: (k: number) => {
          slow = k;
        },
        resetStats: () => {
          stats.builds = stats.buildMs = stats.maxMs = stats.lastMs = stats.maxFrameMs = stats.lookMs = stats.earthMs = stats.writeMs = 0;
        },
        rebuild: () => {
          for (const it of list) {
            if (it.data) cache.release(it.data);
            it.data = null;
            it.earth = null;
            it.sig = -1;
          }
          cache.clear();
          for (const it of list)
            if (it.plant && !it.queued) {
              it.queued = true;
              queue.push(it);
            }
        },
        items: () => list.map((it) => ({ id: it.id, kind: it.kind, x: it.x, y: it.y, z: it.z, foot: it.earth?.foot, h: it.data?.height, mode: it.mode, small: it.small, drop: it.drop ? { fruit: it.drop.fruit.length, t: +it.drop.t.toFixed(2), end: +it.drop.end.toFixed(2) } : null, fallen: it.data?.look.fallen })),
      },
    });
  return view;
}
