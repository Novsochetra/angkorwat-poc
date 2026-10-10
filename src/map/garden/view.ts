import { Box3, Group, Sphere, Vector3, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { frameCap, graphicsNow, markStill, paintRim, pixelSize, plainAt } from '../graphics';
import { GROUND_CLEAR } from '../groundClear';
import type { RoamWorld } from '../roam/types';
import { swayLeaves } from '../veg/sway';
import { GROWN, KINDS, type PlantKindId, type Stage } from './kinds';
import './models';
import { GARDEN, lookOf, lookSig, thirsty, type Plant, type PlantLook } from './state';
import { dropBetween, dropMoves, type Drop } from './_viewDrop';
import { installGardenFx } from './_fx';
import { ThirstDrops } from './_viewThirst';
import { buildEarth, puddleLook, tintEarth, wetLook, type Earth } from './_viewEarth';
import { buildLook, CROWNS, FAMILIES, LookCache, type LookData } from './_viewLook';
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
 * **Far.** A site's plants are two parts: the small (crops, seedlings, young
 * trees, and every plant's earth) and the trees, each with its own bounds. Each
 * is judged by the camera that draws the picture (in the scene's
 * `onBeforeRender`: the free camera, a shot's `cam=`, the minimap's), as the
 * map judges its own meshes (graphics.ts `plainAt`): once its blocks' cut edges
 * span under a pixel where the part comes nearest, its blocks are drawn as plain
 * boxes with their rims painted (`paintRim`: the same picture by eye, the map's
 * own rule, no swap to see); the low level draws them plain always. The small
 * part hides once a metre spans under `SMALL_PX` pixels, the trees once their
 * biggest crown spans under one. The overview sees the trees, as plain boxes.
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
  /** Every frame: what is far is hidden, the leaves sway (the camera, seconds; the frame's `drift`: still under "reduce motion"). */
  frame(camera: Camera, t: number, drift?: number, night?: number): void;
  dispose(): void;
}

/** Small things (crops, seedlings, the earth: about a metre) hide under this many pixels a metre. */
const SMALL_PX = 2.5;
/** A plant is small (with the crops) under this height (m). */
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
/** Earths re-tinted at most this many a frame (rain on the whole garden: spread over a few frames). */
const TINTS = 6;

type Site = 'home' | 'pagoda';
/** A site's parts: the small things and every earth, and the trees. */
const SMALL = 0;
const TREE = 1;

interface Part {
  readonly group: Group;
  /** Its pools, as `FAMILIES`. */
  readonly pools: readonly Pool[];
  readonly sphere: Sphere;
  readonly box: Box3;
  /** Its blocks' largest cut edge (m), its biggest crown across (m), as last measured. */
  edge: number;
  maxCrown: number;
  /** Drawn as plain boxes now; shown now. */
  plain: boolean;
  shown: boolean;
}

interface Batch {
  readonly at: Site;
  readonly group: Group;
  readonly parts: readonly [Part, Part];
  readonly items: Item[];
  boundsDirty: boolean;
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
  /** Runs: the look's per family (as `FAMILIES`, in its part's pools), the earth's and the puddle's (the small part's). */
  readonly runs: (Run | null)[];
  rock: Run | null;
  pud: Run | null;
  /** Its look's part (`SMALL`, `TREE`). */
  part: number;
  /** Scale animation: what it does, its time, from what size. */
  mode: 0 | 1 | 2 | 3 | 4 | 5;
  /** Taken out (`FELL`, `UPROOT`): the way he faced, the tip (rad) about the level axis (`ax`, `az`), the plant's move (m). */
  outYaw: number;
  tilt: number;
  ax: number;
  az: number;
  ox: number;
  oy: number;
  oz: number;
  /** Its fall has landed (the dust and leaves thrown). */
  landed: boolean;
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
  drop: Drop | null;
  stamp: number;
  queued: boolean;
}
const NONE = 0;
const GROW = 1;
const EASE = 2;
const LEAVE = 3;
/** A grown tree felled: it tips over away from him, lands with a little bounce, lies, then sinks away. */
const FELL = 4;
/** A plant dug up: lifted out, laid on the ground beside him, then gone. */
const UPROOT = 5;
/** The fall (s): tipping to the ground, the bounce, lying, sinking away; how far it tips (rad: its crown on the ground). */
const FALL = { tip: 0.8, bounce: 0.4, lie: 0.9, sink: 1.5, angle: 1.42 };
/** Dug up (s): lifted out, carried and laid down, lying, gone; where it is laid (m: to his right, back toward him). */
const DUG = { lift: 0.25, lay: 0.35, lie: 0.8, gone: 0.8, right: 0.8, back: 0.35 };

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

  function makePart(at: Site, name: string): Part {
    const group = new Group();
    group.name = `garden:${at}:${name}`;
    const sphere = new Sphere(new Vector3(), 0);
    const box = new Box3();
    const pools = FAMILIES.map((mat) => new Pool(mat, group.name, false, mat === 'mapLeaf' ? 1024 : 256, sphere, box));
    for (const p of pools) {
      p.mesh.onBeforeRender = askShadow;
      group.add(p.mesh);
    }
    return { group, pools, sphere, box, edge: 0, maxCrown: 0, plain: false, shown: true };
  }
  function makeBatch(at: Site): Batch {
    const group = new Group();
    group.name = `garden:${at}`;
    const parts = [makePart(at, 'small'), makePart(at, 'trees')] as const;
    group.add(parts[SMALL].group, parts[TREE].group);
    // Leaves sway as the village's; still shadows.
    swayLeaves(group, world.field);
    markStill(group);
    object.add(group);
    return { at, group, parts, items: [], boundsDirty: true };
  }
  const batches: Record<Site, Batch> = { home: makeBatch('home'), pagoda: makeBatch('pagoda') };
  const batchList: readonly Batch[] = [batches.home, batches.pagoda];

  // The work's effects (garden/_fx.ts: the hook garden/fx.ts `GARDEN_FX`): they ask where a plant's crown is.
  /**
   * Plants being taken out by his work (the effects say which as its beats come: dug up or felled), the way he faced,
   * and whether it goes now (a felled tree stands, cut through, until the work's `fall`; one dug up comes at `out`).
   */
  const leaving = new Map<number, { how: 4 | 5; yaw: number; go: boolean }>();
  const fx = installGardenFx(object, world, (id) => {
    const it = items.get(id);
    if (!it?.data) return null;
    return { x: it.x, y: it.y + (it.earth?.foot ?? 0), z: it.z, height: it.data.height, base: it.data.crown?.base ?? 0, reach: it.data.reach };
  }, shot, (id, how, yaw, beat) => {
    let was = leaving.get(id);
    if (!was) leaving.set(id, (was = { how: how === 'fell' ? FELL : UPROOT, yaw, go: false }));
    was.how = how === 'fell' ? FELL : UPROOT;
    was.yaw = yaw;
    if (beat === (how === 'fell' ? 'fall' : 'out')) was.go = true;
  });
  let lastDrift = Number.NaN;
  // A drop of water over each plant that wants it (garden/_viewThirst.ts); burst into splashes when watered.
  const thirst = new ThirstDrops(shot);
  object.add(thirst.mesh);
  const bursts = new Float32Array(3 * 16);

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
    // (taken out: tipped about the level axis (ax, az) through its foot, Rodrigues' rotation of each column)
    if (it.tilt !== 0) {
      const ct = Math.cos(it.tilt);
      const st = Math.sin(it.tilt);
      const ax = it.ax;
      const az = it.az;
      const r00 = ct + ax * ax * (1 - ct);
      const r02 = ax * az * (1 - ct);
      const r22 = ct + az * az * (1 - ct);
      for (let col = 0; col < 3; col++) {
        const x = A[col * 3];
        const y = A[col * 3 + 1];
        const z = A[col * 3 + 2];
        A[col * 3] = r00 * x - az * st * y + r02 * z;
        A[col * 3 + 1] = az * st * x + ct * y - ax * st * z;
        A[col * 3 + 2] = r02 * x + ax * st * y + r22 * z;
      }
    }
    A[9] = it.x + it.ox;
    A[10] = it.y + (it.earth?.foot ?? 0) * Math.min(1, it.earthUp) + it.oy;
    A[11] = it.z + it.oz;
    return A;
  };
  /** Where its earth's blocks go (square to the map): flattened by `up`, a little narrower as it rises or flattens; `p` the puddle's share. */
  const earthXf = (it: Item, p = 1): Float64Array => {
    const up = Math.max(1e-3, Math.min(1, it.earthUp) * p);
    // (rising: from three quarters wide; taken out: it flattens and narrows away to nothing, no flat patch left)
    const wide = Math.max(1e-3, (it.plant ? 0.75 + 0.25 * Math.min(1, it.earthUp) : Math.min(1, it.earthUp * 1.5)) * p);
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
    if (it.mode === FELL) return 1 - Math.min(1, Math.max(0, (it.t - FALL.tip - FALL.bounce - FALL.lie) / FALL.sink)) ** 2;
    if (it.mode === UPROOT) return 1 - Math.min(1, Math.max(0, (it.t - DUG.lift - DUG.lay - DUG.lie) / DUG.gone)) ** 2;
    return 1;
  };

  /** A felled tree at `it.t` s: tipping away from him (falling ever faster), the bounce, lying, sinking away. True once gone. */
  function felling(it: Item): boolean {
    const wx = Math.sin(it.outYaw);
    const wz = Math.cos(it.outYaw);
    // (the axis it tips about: level, across the way it falls)
    it.ax = wz;
    it.az = -wx;
    const t = it.t;
    if (t < FALL.tip) it.tilt = FALL.angle * (t / FALL.tip) ** 2;
    else {
      const v = Math.min(1, (t - FALL.tip) / FALL.bounce);
      it.tilt = FALL.angle - 0.12 * Math.sin(Math.PI * v) * (1 - v);
      if (!it.landed) {
        it.landed = true;
        const d = it.data;
        if (d) fx.fell(it.kind, it.x, it.y, it.z, wx, wz, d.height, d.crown?.base ?? d.height * 0.4, d.reach);
      }
    }
    // (lying: it sinks a little as it goes; its basin flattens from the landing)
    const gone = Math.max(0, (t - FALL.tip - FALL.bounce - FALL.lie) / FALL.sink);
    it.oy = -0.25 * gone;
    it.earthUp = 1 - Math.min(1, Math.max(0, (t - FALL.tip) / 1.0));
    return t >= FALL.tip + FALL.bounce + FALL.lie + FALL.sink;
  }
  /** A plant dug up at `it.t` s: lifted out with its roots, carried to his side and laid down, lying, gone. True once gone. */
  function digging(it: Item): boolean {
    const wx = Math.sin(it.outYaw);
    const wz = Math.cos(it.outYaw);
    // (where it is laid: to his right and back toward him)
    const lx = -wz * DUG.right - wx * DUG.back;
    const lz = wx * DUG.right - wz * DUG.back;
    const l = Math.hypot(lx, lz) || 1;
    it.ax = lz / l;
    it.az = -lx / l;
    const t = it.t;
    if (t < DUG.lift) {
      const u = easeOutCubic(t / DUG.lift);
      it.oy = 0.35 * u;
      it.tilt = 0.12 * u;
      it.ox = it.oz = 0;
    } else {
      const u = easeOutCubic(Math.min(1, (t - DUG.lift) / DUG.lay));
      it.ox = lx * u;
      it.oz = lz * u;
      it.oy = 0.35 * (1 - u) + 0.04 * u - (it.earth?.foot ?? 0) * u;
      it.tilt = 0.12 + (1.35 - 0.12) * u;
      if (u >= 1 && !it.landed) {
        it.landed = true;
        fx.puff(it.x + lx, it.y, it.z + lz, 0.3);
      }
    }
    it.earthUp = 1 - Math.min(1, t / 0.8);
    if (t > DUG.lift + DUG.lay + DUG.lie) it.oy -= 0.1 * Math.min(1, (t - DUG.lift - DUG.lay - DUG.lie) / DUG.gone);
    return t >= DUG.lift + DUG.lay + DUG.lie + DUG.gone;
  }

  function writePlant(it: Item, attrs: boolean): void {
    const pools = it.batch.parts[it.part].pools;
    const s = scaleOf(it);
    const a = plantXf(it, s);
    const d = it.data;
    if (!d) return;
    if (it.drop) dropMoves(it.drop, it.yaw, s);
    for (let fi = 0; fi < FAMILIES.length; fi++) {
      const f = d.fams[fi];
      const run = it.runs[fi];
      if (f && run) pools[fi].write(run, f, a, it.drop?.move[fi] ?? null, 0, f.n, attrs);
    }
  }

  function writeEarth(it: Item, attrs: boolean): void {
    const e = it.earth;
    const pools = it.batch.parts[SMALL].pools;
    if (!e) return;
    if (it.rock) pools[ROCK].write(it.rock, e.rock, earthXf(it), null, 0, e.rock.n, attrs);
    if (e.puddle && it.pud) pools[STONE].write(it.pud, e.puddle, earthXf(it, Math.max(1e-3, it.pud0)), null, 0, e.puddle.n, attrs);
    it.pudW = it.pud0;
    if (attrs) tint(it);
  }

  /** The earth's colours for the wetness shown. */
  function tint(it: Item): void {
    const e = it.earth;
    if (!e || !it.rock) return;
    it.earthC ??= new Float32Array(e.rock.n * 3);
    if (it.earthC.length !== e.rock.n * 3) it.earthC = new Float32Array(e.rock.n * 3);
    tintEarth(e, it.wet, it.earthC);
    it.batch.parts[SMALL].pools[ROCK].colors(it.rock, it.earthC);
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
      const small = b.parts[SMALL].pools;
      it.rock = small[ROCK].fit(it.rock, it.earth.rock.n);
      it.pud = small[STONE].fit(it.pud, it.earth.puddle?.n ?? 0);
      // (the map's grass, flowers and ferns keep off the dug earth: map/groundClear.ts, veg/undergrowth.ts)
      GROUND_CLEAR.set(it.id, it.x, it.z, it.earth.reach);
    }
    const t2 = performance.now();
    stats.earthMs = Math.max(stats.earthMs, t2 - t1);
    // Its look's runs, in its part (a tree joins the trees once it stands taller than a man and a half).
    const part = k.size === 'crop' || next.height < SMALL_H ? SMALL : TREE;
    if (part !== it.part) {
      for (let fi = 0; fi < FAMILIES.length; fi++) it.runs[fi] = b.parts[it.part].pools[fi].fit(it.runs[fi], 0);
      it.part = part;
    }
    for (let fi = 0; fi < FAMILIES.length; fi++) it.runs[fi] = b.parts[part].pools[fi].fit(it.runs[fi], next.fams[fi]?.n ?? 0);
    // (its crown, for the follow camera: roam/_gardenWalk.ts)
    const foot = it.y + it.earth.foot;
    if (next.crown && part === TREE) CROWNS.set(it.id, { x: it.x, z: it.z, y0: foot + next.crown.base, y1: foot + next.height, r: next.crown.r });
    else CROWNS.delete(it.id);
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
    for (let fi = 0; fi < FAMILIES.length; fi++) it.runs[fi] = b.parts[it.part].pools[fi].fit(it.runs[fi], 0);
    it.rock = b.parts[SMALL].pools[ROCK].fit(it.rock, 0);
    it.pud = b.parts[SMALL].pools[STONE].fit(it.pud, 0);
    CROWNS.delete(it.id);
    GROUND_CLEAR.set(it.id, 0, 0, 0);
    leaving.delete(it.id);
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
      part: SMALL,
      mode: NONE,
      outYaw: 0,
      tilt: 0,
      ax: 1,
      az: 0,
      ox: 0,
      oy: 0,
      oz: 0,
      landed: false,
      t: 0,
      from: 1,
      earthUp: 1,
      wet: wetLook(p.wet),
      wetW: -1,
      pud0: puddleLook(p.wet),
      pudW: -1,
      earthC: null,
      drop: null,
      stamp,
      queued: false,
    };
    items.set(p.id, it);
    list.push(it);
    batch.items.push(it);
    return it;
  }

  /** A batch's parts' bounds (their plants, heights and reach; every earth in the small part), where their holes are parked, their cut edges. */
  function fitBounds(b: Batch): void {
    b.boundsDirty = false;
    for (let pi = 0; pi < 2; pi++) {
      const part = b.parts[pi];
      const c = part.sphere.center.set(0, 0, 0);
      part.box.makeEmpty();
      part.maxCrown = 0;
      let n = 0;
      for (const it of b.items) if (pi === SMALL || it.part === TREE) n++;
      if (!n) {
        part.sphere.radius = 0;
        continue;
      }
      for (const it of b.items)
        if (pi === SMALL || it.part === TREE) {
          c.x += it.x / n;
          c.z += it.z / n;
        }
      let lo = Infinity;
      let hi = -Infinity;
      let r = 0;
      for (const it of b.items) {
        if (pi === TREE && it.part !== TREE) continue;
        const mine = it.part === pi;
        const h = mine ? (it.data?.height ?? 1) + (it.earth?.foot ?? 0) : 0.2;
        // (a felled tree lies its height out from its foot; one dug up, beside him)
        const out = it.mode === FELL ? (it.data?.height ?? 0) : it.mode === UPROOT ? 1.5 : 0;
        const reach = Math.max(mine ? (it.data?.reach ?? 1) : 0, pi === SMALL ? (it.earth?.reach ?? 0) : 0, out, 0.5) + 0.3;
        lo = Math.min(lo, it.y - 0.2);
        hi = Math.max(hi, it.y + h + 0.3);
        r = Math.max(r, Math.hypot(it.x - c.x, it.z - c.z) + reach);
        part.box.expandByPoint(_eye.set(it.x - reach, it.y - 0.2, it.z - reach));
        part.box.expandByPoint(_eye.set(it.x + reach, it.y + h + 0.3, it.z + reach));
        if (pi === TREE && it.data) part.maxCrown = Math.max(part.maxCrown, it.data.reach * 2);
      }
      c.y = (lo + hi) / 2;
      part.sphere.radius = Math.hypot(r, (hi - lo) / 2);
      let edge = 0;
      for (const p of part.pools) {
        p.park = { x: c.x, y: lo, z: c.z };
        edge = Math.max(edge, p.edge());
      }
      part.edge = edge;
    }
  }

  /**
   * How a part is drawn for the camera that draws the picture now: hidden once too small to see, its blocks plain
   * (rims painted) once their cut edges are under a pixel where it comes nearest, as the map's own meshes.
   */
  function judge(b: Batch, camera: Camera): void {
    _eye.setFromMatrixPosition(camera.matrixWorld);
    const px = pixelSize(camera);
    for (let pi = 0; pi < 2; pi++) {
      const part = b.parts[pi];
      if (part.sphere.radius <= 0) {
        part.group.visible = false;
        continue;
      }
      const d = Math.max(0.01, _eye.distanceTo(part.sphere.center) - part.sphere.radius);
      const size = pi === SMALL ? 1 : part.maxCrown;
      const need = pi === SMALL ? SMALL_PX : 1;
      part.shown = size / (d * px) >= need / (part.shown ? 1 + HOLD : 1);
      part.group.visible = part.shown;
      if (!part.shown) continue;
      // (an edge not measured yet, or blocks still growing in: never plain near)
      const plain = graphicsNow.plainBlocks || (force ? force === 'far' : part.edge > 0.005 && plainAt(d, part.edge, px, part.plain));
      const paint = plain && !graphicsNow.plainBlocks;
      for (const p of part.pools) {
        p.plain(plain);
        paintRim(p.mesh, paint);
      }
      part.plain = plain;
    }
  }
  const judgeAll = (camera: Camera) => {
    for (let i = 0; i < batchList.length; i++) {
      const b = batchList[i];
      b.group.visible = b.items.length > 0;
      if (b.group.visible) judge(b, camera);
    }
  };
  /** The scene the garden is drawn in: judged in its `onBeforeRender`, with the camera of each picture drawn. */
  let hooked: Scene | null = null;
  function hookScene(): void {
    let root: Object3D = object;
    while (root.parent) root = root.parent;
    if (!(root as Scene).isScene || hooked === root) return;
    hooked = root as Scene;
    const before = hooked.onBeforeRender;
    // (three calls a scene's with the renderer, the scene, the camera and the target, before it culls)
    hooked.onBeforeRender = function (this: Scene, ...args: Parameters<Scene['onBeforeRender']>) {
      before.apply(this, args);
      if (alive) judgeAll(args[2]);
    };
  }

  function flushAll(): void {
    for (let i = 0; i < batchList.length; i++) {
      const b = batchList[i];
      if (b.boundsDirty) fitBounds(b);
      for (let pi = 0; pi < 2; pi++) for (const p of b.parts[pi].pools) p.flush();
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
  /**
   * Its looks to come soon: the next stage within a tenth of its way; the fruit ripening; ripe fruit about to fall;
   * once ripe, the look after the harvest (picked: cut, no fruit); once drooping, the look after a watering and (not
   * yet grown) the dead stick it becomes if no one comes.
   */
  function nextLooks(it: Item, out: PlantLook[]): void {
    const p = it.plant;
    const d = it.data;
    if (!p || !d || p.dead) return;
    const k = KINDS[it.kind];
    const l = d.look;
    if (l.droop) {
      out.push({ ...l, droop: 0 });
      if (l.stage < GROWN) out.push({ ...l, droop: 0, fruit: 0, dead: true });
    }
    if (l.stage < GROWN) {
      const at = l.stage < 3 ? k.stageAt[l.stage as 0 | 1 | 2] : 1;
      if (p.age / k.growDays > at - 0.1) out.push({ ...l, stage: (l.stage + 1) as Stage, fruit: 0, fallen: 0, droop: 0 });
      return;
    }
    if (k.fruit.count[1] <= 0) return;
    const ground = k.fruit.pick === 'ground';
    // (picked: what a harvest leaves; a `once` plant is pulled with its harvest)
    if ((ground ? l.fallen > 0 : l.fruit === 2) && k.fruit.harvest === 'again') out.push({ ...l, fruit: 0, fallen: 0, droop: 0, cut: true });
    if (p.ripe < 0.25) return;
    if (ground) {
      if (p.ripe > 0.75 && !l.fallen) for (let n = k.fruit.count[0]; n <= Math.min(3, k.fruit.count[1]); n++) if (n > 0) out.push({ ...l, fruit: 0, fallen: n, droop: 0 });
    } else if (l.fruit < 2) out.push({ ...l, fruit: (l.fruit + 1) as 1 | 2, droop: 0 });
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

  // ── Every model's code run once before play (roaming waits for the add-ons; the loading screen stays for
  // seconds after), so no model's first build (the JIT's first compile of its code, tens of ms) lands in a frame of
  // play. One look a task, between the loading screen's frames (no long task: about a second in all, the loading
  // screen stays for many). The garden's own plants build as soon as they are seen (spread over frames, under the
  // loading screen too) ──
  const warmList: PlantLook[] = [];
  if (!shot) {
    const L = (stage: Stage, more: Partial<PlantLook> = {}) => {
      for (const kind of Object.keys(KINDS) as PlantKindId[]) warmList.push({ kind, stage, fruit: 0, fallen: 0, droop: 0, dead: false, cut: false, seed: 0.5, ...more });
    };
    for (let st = 0; st <= 4; st++) L(st as Stage);
    L(4, { fruit: 1 });
    L(4, { fruit: 2, cut: true });
    L(4, { fallen: 2 });
    L(2, { droop: 2 });
    L(1, { dead: true });
  }
  let warmAt = 0;
  let warmLongest = 0;
  const warmOne = (): boolean => {
    const l = warmList[warmAt++];
    if (!l) return false;
    const t0 = performance.now();
    try {
      buildLook(l);
    } catch (e) {
      console.warn(`[garden] the ${l.kind} model failed to build (stage ${l.stage}):`, e);
    }
    const ms = performance.now() - t0;
    stats.warmMs += ms;
    warmLongest = Math.max(warmLongest, ms);
    if (warmAt === warmList.length) console.info(`[garden] every plant's model run once: ${warmList.length} looks in ${stats.warmMs.toFixed(0)} ms, ${warmLongest.toFixed(1)} ms at most a task (before play: no first build in a frame of play)`);
    return true;
  };
  const warmStep = () => {
    if (alive && warmOne()) setTimeout(warmStep, 0);
  };
  if (warmList.length) setTimeout(warmStep, 0);

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
        const out = leaving.get(it.id);
        if (settled && !shot && it.data) {
          it.mode = out ? out.how : LEAVE;
          it.from = 0;
          it.outYaw = out ? out.yaw : 0;
          it.t = 0;
          it.drop = null;
          it.landed = false;
          it.batch.boundsDirty = true;
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
    frame(camera, t, drift, night = 0) {
      const t0 = performance.now();
      const real = Number.isNaN(lastT) ? 0 : t - lastT;
      const dt = shot ? 0 : Math.min(0.1, Math.max(0, real)) * slow;
      smooth = real > 0 && real <= frameCap.time * 1.3 ? smooth + 1 : 0;
      lastT = t;
      now += dt;
      // (the "reduce motion" setting: the drift clock stands while frames go by)
      const calm = drift !== undefined && real > 0 && drift === lastDrift;
      if (drift !== undefined) lastDrift = drift;
      let tints = 0;
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
          } else if (it.mode === FELL) {
            // (cut through, it stands until the work's `fall`: three seconds at most, the work stopped meanwhile)
            if (!(leaving.get(it.id)?.go ?? true) && (it.from += dt) < 3) it.t = 0;
            if (felling(it)) {
              release(it);
              continue;
            }
          } else if (it.mode === UPROOT) {
            if (digging(it)) {
              release(it);
              continue;
            }
          } else it.earthUp = 1;
          moved = true;
          // (done: its blocks at their size, measured again for the plain boxes far off)
          if (!it.mode && it.earthUp >= 1) {
            shadowWant = true;
            it.batch.boundsDirty = true;
          }
        }
        if (it.drop) {
          it.drop.t += dt;
          // (a fruit hitting the ground: a puff of dust there)
          const dr = it.drop;
          for (let k = 0; k < dr.fruit.length; k++) {
            const f = dr.fruit[k];
            if (dr.landed[k] || dr.t < f.delay + f.fall) continue;
            dr.landed[k] = 1;
            const c = Math.cos(it.yaw);
            const sn = Math.sin(it.yaw);
            fx.puff(it.x + c * f.lx + sn * f.lz, it.y + (it.earth?.foot ?? 0), it.z - sn * f.lx + c * f.lz, KINDS[it.kind].height > 9 ? 1 : 0.5);
          }
          if (it.drop.t >= it.drop.end) {
            dropMoves(it.drop, it.yaw, 1);
            it.drop = null;
            shadowWant = true;
            it.batch.boundsDirty = true;
          }
          moved = true;
        }
        if (moved) {
          writePlant(it, false);
          writeEarth(it, false);
        }
        // The earth's water: darker in half a second when watered, paler as it dries; the puddle soaking in.
        const p = it.plant;
        // (its drop of water, wanting it: over its top)
        if (p && p.at === 'home')
          thirst.set(it.id, thirsty(p), p.wet <= 0 && p.dry >= KINDS[p.kind].dieAfter * 0.5, it.x, it.y + (it.earth?.foot ?? 0) * Math.min(1, it.earthUp) + it.data.height * scaleOf(it) + 0.25, it.z);
        if (p && it.earth) {
          const w = wetLook(p.wet);
          it.wet = dt > 0 && Math.abs(w - it.wet) > 0.003 ? it.wet + (w - it.wet) * (1 - Math.exp(-dt / WET_TAU)) : w;
          if (it.wet !== it.wetW && (Math.abs(it.wet - it.wetW) > 0.01 || it.wet === w) && (tints++ < TINTS || dt === 0)) tint(it);
          const pd = it.earth.puddle ? puddleLook(p.wet) : 0;
          it.pud0 = dt > 0 && Math.abs(pd - it.pud0) > 0.003 ? it.pud0 + (pd - it.pud0) * (1 - Math.exp(-dt / WET_TAU)) : pd;
          if (it.pud && it.pud0 !== it.pudW && (Math.abs(it.pud0 - it.pudW) > 0.01 || it.pud0 === pd)) {
            it.batch.parts[SMALL].pools[STONE].write(it.pud, it.earth.puddle!, earthXf(it, Math.max(1e-3, it.pud0)), null, 0, it.earth.puddle!.n, false);
            it.pudW = it.pud0;
          }
        }
      }
      const nb = thirst.frame(dt, camera, bursts, night);
      for (let k = 0; k < nb; k++) fx.pop(bursts[k * 3], bursts[k * 3 + 1], bursts[k * 3 + 2]);
      fx.frame(dt, calm);
      flushAll();
      // (judged as each picture is drawn; here too, for the frames before the scene is found)
      hookScene();
      if (!hooked) judgeAll(camera);
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
      fx.dispose();
      thirst.dispose();
      for (const b of batchList) for (const part of b.parts) for (const p of part.pools) p.dispose();
      for (const it of list) {
        CROWNS.delete(it.id);
        GROUND_CLEAR.set(it.id, 0, 0, 0);
      }
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
            fx: fx.stats(),
            thirst: thirst.shown,
            warm: `${Math.min(warmAt, warmList.length)}/${warmList.length}, longest ${warmLongest.toFixed(1)} ms`,
            build: { n: stats.builds, avgMs: +(stats.buildMs / Math.max(1, stats.builds)).toFixed(3), maxMs: +stats.maxMs.toFixed(3), lastMs: +stats.lastMs.toFixed(3) },
            frame: { ms: +stats.frameMs.toFixed(3), maxMs: +stats.maxFrameMs.toFixed(3) },
            parts: { lookMs: +stats.lookMs.toFixed(3), earthMs: +stats.earthMs.toFixed(3), writeMs: +stats.writeMs.toFixed(3) },
            lod: Object.fromEntries(batchList.map((b) => [b.at, b.parts.map((p, i) => ({ part: i ? 'trees' : 'small', shown: p.shown && p.group.visible, plain: p.plain, r: +p.sphere.radius.toFixed(1), edge: +p.edge.toFixed(3), edgeNow: +Math.max(0, ...p.pools.map((q) => q.edge())).toFixed(3), used: p.pools.map((q) => q.used).join(" "), maxCrown: +p.maxCrown.toFixed(2) }))])),
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
        items: () => list.map((it) => ({ id: it.id, kind: it.kind, x: it.x, y: it.y, z: it.z, foot: it.earth?.foot, h: it.data?.height, mode: it.mode, part: it.part, drop: it.drop ? { fruit: it.drop.fruit.length, t: +it.drop.t.toFixed(2), end: +it.drop.end.toFixed(2) } : null, fallen: it.data?.look.fallen })),
      },
    });
  return view;
}
