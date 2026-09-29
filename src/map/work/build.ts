import type { SourceTrace } from '../../feedback/sourceTrace';
import type { InstancedMesh, Object3D } from 'three';
import { TraceTable, unpackVoxelMesh, type PackedVoxelGroup } from '../../voxel/VoxelMesh';
import { coverBoxes, coverGroups } from '../cull';
import { buildHeightField, CELL, HeightField } from '../heightfield';
import { MAP_BOUNDS, PLATEAUS } from '../layout';
import type { TerrainMeshes } from '../terrain';
import type { MapQuality } from '../types';
import type { PlantedJungle } from '../vegetation';
import type { CoversOut, Job, LandOut, Reply, ShapeOut, TerrainOut, VegetationOut } from './protocol';
import { decodeBuilders, packBoxes, tracesFrom } from './transfer';

/**
 * The map's build, its heavy pure-data work in Web Workers (build.worker.ts),
 * so the page's thread only makes the three.js objects, and the loading
 * screen stays smooth:
 *
 *  - the land (heightfield.ts), as the page opens: its first shape a share of
 *    the rows in each worker, the rest in the first; the others get a copy;
 *  - the land's blocks (terrain/lay.ts), laid and packed into their meshes'
 *    arrays in every worker at once, a share of the chunks each (all the
 *    rocks in each: they take their cells one after another), while the page
 *    builds the atmosphere; the page makes the meshes in the terrain's place;
 *  - the jungle's prototypes, early in one worker, and the jungle planted
 *    there in the vegetation's place (on the land as the page has it then:
 *    what the landmarks, the road and the sites took, the reserved spots);
 *  - meanwhile, in another, the sides `cutCovered` (cull.ts) leaves out after
 *    the build, of the parts built so far (used if those are still the same).
 *
 * The same code runs in a worker as on the page, on a copy of the land, and
 * the page makes its objects in the same order: the same blocks, colours,
 * instance order, bounds and pictures (scripts/build-check.mjs). The
 * workers' blocks keep their traces for the bug report tool (B, dev builds):
 * the stacks' text, one trace per line.
 *
 * `work=0` in the URL builds all on the page (as before); `workers=<n>` sets
 * how many (default: the cores less two, at most 4: more slowed each down on
 * an M1 Max). If a worker cannot start, or a job fails or takes over 30 s,
 * that part and the rest are built on the page (logged once).
 */

/** What a mesh's blocks are (for `covers`): the mesh, how many it draws, its matrices and open sides (arrays and versions). */
interface MeshState {
  mesh: InstancedMesh;
  count: number;
  matrix: ArrayLike<number>;
  matrixVersion: number;
  open: unknown;
  openArray: ArrayLike<number>;
  openVersion: number;
}
const meshState = (m: InstancedMesh): MeshState => {
  const open = m.geometry.getAttribute('voxOpen');
  return { mesh: m, count: m.count, matrix: m.instanceMatrix.array, matrixVersion: m.instanceMatrix.version, open, openArray: open.array, openVersion: (open as { version?: number }).version ?? 0 };
};
const sameState = (a: MeshState, m: InstancedMesh): boolean => {
  const b = meshState(m);
  return a.mesh === b.mesh && a.count === b.count && a.matrix === b.matrix && a.matrixVersion === b.matrixVersion && a.open === b.open && a.openArray === b.openArray && a.openVersion === b.openVersion;
};

/**
 * The land's rows shared out for its first shape (heightfield.ts `firstShape`): as many rows each, about, but a
 * row's cells under a mesa's reach cost some 2.5 times the others (its outline's noise). Ranges [k0, k1).
 */
function shapeShares(nx: number, nz: number, of: number): [number, number][] {
  const cost = new Float64Array(nz).fill(nx);
  for (const p of PLATEAUS) {
    const R = Math.max(p.rx, p.rz) * (1 + (p.rough ?? 0.1));
    const w = Math.min(nx, Math.floor((2 * R) / CELL) + 1);
    const k0 = Math.max(0, Math.floor((p.z - R - MAP_BOUNDS.z0) / CELL));
    const k1 = Math.min(nz - 1, Math.floor((p.z + R - MAP_BOUNDS.z0) / CELL));
    for (let k = k0; k <= k1; k++) cost[k] += 2.5 * w;
  }
  const total = cost.reduce((a, b) => a + b, 0);
  const out: [number, number][] = [];
  let k = 0;
  let sum = 0;
  for (let w = 0; w < of; w++) {
    const start = k;
    const goal = (total * (w + 1)) / of;
    while (k < nz && (w === of - 1 || sum + cost[k] / 2 < goal)) sum += cost[k++];
    out.push([start, k]);
  }
  return out;
}

/** Longest a job may take before its part is built on the page instead (ms: a slow phone takes a few seconds). */
const TIMEOUT = 30_000;

interface Pending {
  resolve: (r: { out: unknown; ms: number } | null) => void;
  worker: number;
  job: Job['job'];
  timer: number;
}

/** What the workers did, for the console and `__mapStats.work`. */
export interface WorkStats {
  /** Workers used (0: all built on the page), of the machine's cores. */
  workers: number;
  cores: number;
  /** Per job: ms in its worker. */
  jobs: Record<string, number>;
  /** Per part: ms the page waited for its workers. */
  waited: Record<string, number>;
  /** Per part: when the page asked for it (ms since the workers started). */
  asked: Record<string, number>;
  /** Per job: when it began in its worker (ms since the workers started). */
  began: Record<string, number>;
  /** Work on the page for a worker's results (ms): the jungle's blocks made again from their arrays. */
  onPage: Record<string, number>;
  /** Why the page built on its own, if it did. */
  fallback: string | null;
}

export class BuildWork {
  readonly stats: WorkStats;
  private readonly workers: Worker[] = [];
  private readonly born = performance.now();
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private failed: string | null = null;
  private readonly traceCache = new Map<string, SourceTrace>();
  /** `covers`' results: per group, its meshes as they were and the sides of their blocks. */
  private readonly covered = new Map<Object3D, { meshes: MeshState[]; sides: Uint8Array }>();
  private readonly landP: Promise<{ out: unknown; ms: number } | null>;
  /** The land's job is asked of the first worker (its next jobs go after it). */
  private readonly landSent: Promise<void>;
  private terrainP: Promise<({ out: unknown; ms: number } | null)[]> | null = null;
  private quality: MapQuality = 'medium';
  private terrainWanted = false;
  private vegetationWanted = false;
  /** The worker that plants the jungle (and made its prototypes). */
  private readonly vegWorker: number;

  constructor(params: URLSearchParams) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const asked = params.get('work') === '0' ? 0 : params.has('workers') ? Math.max(0, Math.floor(Number(params.get('workers')) || 0)) : Math.min(4, Math.max(1, cores - 2));
    let size = typeof Worker === 'undefined' ? 0 : asked;
    try {
      for (let w = 0; w < size; w++) {
        // (the options must stay static: Vite reads them to bundle the worker)
        const worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<Reply>) => this.reply(e.data);
        worker.onerror = (e) => this.fail(`worker ${w + 1}: ${e.message || 'could not start'}`);
        worker.onmessageerror = () => this.fail(`worker ${w + 1}: a message could not be read`);
        this.workers.push(worker);
      }
    } catch (e) {
      this.fail(`no workers: ${e instanceof Error ? e.message : String(e)}`);
      size = 0;
    }
    if (asked > 0 && typeof Worker === 'undefined') this.fail('no Web Workers here');
    this.vegWorker = Math.max(0, this.workers.length - 1);
    this.stats = { workers: this.workers.length, cores, jobs: {}, waited: {}, asked: {}, began: {}, onPage: {}, fallback: this.failed };
    // The land, at once (it needs nothing from the page): its first shape a share of the rows in each worker, the
    // rest in the first.
    let sent: () => void = () => undefined;
    this.landSent = new Promise((r) => (sent = r));
    const of = this.workers.length;
    if (of < 2) {
      this.landP = this.ask(0, { job: 'land' });
      sent();
    } else {
      const nx = Math.round((MAP_BOUNDS.x1 - MAP_BOUNDS.x0) / CELL);
      const nz = Math.round((MAP_BOUNDS.z1 - MAP_BOUNDS.z0) / CELL);
      const rows = shapeShares(nx, nz, of);
      this.landP = Promise.all(rows.map(([k0, k1], w) => this.ask(w, { job: 'shape', k0, k1 }))).then((shapes) => {
        if (shapes.some((s) => !s)) {
          sent();
          return null;
        }
        const first = new Float32Array(nx * nz);
        shapes.forEach((s, w) => first.set((s!.out as ShapeOut).rows, rows[w][0] * nx));
        const land = this.ask(0, { job: 'land', first }, [first.buffer]);
        sent();
        return land;
      });
    }
  }

  /** Workers in use now (0: the page builds alone). */
  get size(): number {
    return this.failed ? 0 : this.workers.length;
  }

  /**
   * What the build will want (as soon as the page knows its detail and which parts it builds): the land's blocks
   * (worker 1 starts on them as the land is done), the jungle (its prototypes are made early).
   */
  plan(o: { quality: MapQuality; terrain: boolean; vegetation: boolean }): void {
    this.quality = o.quality;
    this.terrainWanted = o.terrain;
    this.vegetationWanted = o.vegetation;
    if (!this.size) return;
    const of = this.workers.length;
    const terrainJob = (part: number): Job => ({ job: 'terrain', part, of, quality: o.quality, report: part === 0 });
    const first = o.terrain ? this.landSent.then(() => this.ask(0, terrainJob(0))) : null;
    // The others get the land as it comes, then their share; the jungle's prototypes after it.
    const rest = this.landP.then((land) => {
      const jobs: Promise<{ out: unknown; ms: number } | null>[] = [];
      if (!land || !this.size) return jobs;
      const data = (land.out as LandOut).field;
      for (let w = 1; w < of; w++) {
        void this.ask(w, { job: 'field', field: data });
        if (o.terrain) jobs.push(this.ask(w, terrainJob(w)));
      }
      if (o.vegetation) void this.ask(this.vegWorker, { job: 'kits' });
      return jobs;
    });
    if (o.terrain) this.terrainP = rest.then((jobs) => Promise.all([first!, ...jobs]));
  }

  /** The land: from the first worker, or built here. */
  async field(): Promise<HeightField> {
    const t0 = performance.now();
    const r = await this.landP;
    if (r) {
      this.waited('land', t0);
      for (const [k, v] of Object.entries((r.out as LandOut).steps)) this.stats.jobs[`land ${k}`] = v;
      // (the land arrives as a copy: the page's own from now on)
      return new HeightField((r.out as LandOut).field);
    }
    return buildHeightField();
  }

  /**
   * The land's meshes from the workers (made here chunk by chunk as the terrain asks, in its order), the cells its
   * rocks took marked on `field` (as laying them here would); null: build them here (terrain.ts).
   */
  async terrain(field: HeightField, quality: MapQuality): Promise<TerrainMeshes | null> {
    if (!this.terrainP || !this.terrainWanted || quality !== this.quality) return null;
    const t0 = performance.now();
    const replies = await this.terrainP;
    this.waited('terrain', t0);
    if (replies.some((r) => !r) || !this.size) return null;
    const outs = replies.map((r) => r!.out as TerrainOut);
    const byChunk = new Map<number, { near: PackedVoxelGroup | null; far: PackedVoxelGroup | null; traces: SourceTrace[] }>();
    for (const o of outs) {
      const traces = tracesFrom(o.traces, this.traceCache);
      for (const c of o.chunks) byChunk.set(c.n, { near: c.near, far: c.far, traces });
    }
    const report = outs[0];
    if (!report.rocks || !report.seen) return null;
    // (the rocks took these cells: no tree grows through them, terrain/rocks.ts)
    for (const c of report.rocks) field.occupied[c] = 1;
    const seen = report.seen;
    this.stats.jobs['terrain lay'] = Math.max(...outs.map((o) => o.lay));
    this.stats.jobs['terrain pack'] = Math.max(...outs.map((o) => o.pack));
    for (const [k, v] of Object.entries(outs[0].steps)) this.stats.jobs[`terrain 1 ${k}`] = v;
    return {
      mesh: (n, lod) => {
        const c = byChunk.get(n);
        const p = c && (lod === 0 ? c.near : c.far);
        return p ? { group: unpackVoxelMesh(p, c.traces), blocks: p.blocks } : null;
      },
      seenAt: (x, z) => {
        const c = field.index(x, z);
        return c < 0 || seen[c] === 1;
      },
    };
  }

  /** The jungle planted by a worker on the land as it is now (`field`: the page's); null: plant it here (vegetation.ts). */
  async vegetation(field: HeightField, quality: MapQuality): Promise<PlantedJungle | null> {
    if (!this.size || !this.vegetationWanted || quality !== this.quality) return null;
    const t0 = performance.now();
    const r = await this.ask(this.vegWorker, { job: 'vegetation', surface: field.surface, occupied: field.occupied, density: quality === 'low' ? 0.7 : 1 });
    this.waited('vegetation', t0);
    if (!r) return null;
    const o = r.out as VegetationOut;
    const t1 = performance.now();
    const planted = decodeBuilders(o.planted, tracesFrom(o.traces, this.traceCache)) as PlantedJungle;
    this.stats.onPage['jungle blocks'] = performance.now() - t1;
    return planted;
  }

  /**
   * The sides each block shows of the voxel groups `cutCovered` will cut under `roots` (cull.ts), worked out in a
   * worker now (the page waits for the jungle: those parts are all built by then); `knownCover` hands them over.
   */
  covers(roots: readonly Object3D[]): void {
    if (!this.size) return;
    const groups = coverGroups(roots).filter((g) => g.open);
    if (!groups.length) return;
    const traces = new TraceTable();
    const packed = groups.map((g) => packBoxes(coverBoxes(g.meshes), traces));
    // (the meshes as they are now: the sides are theirs only while they stay so)
    const now = groups.map((g) => g.meshes.map(meshState));
    // (in the first worker: the jungle is planted in the last)
    void this.ask(0, { job: 'covers', groups: packed }, packed.flatMap((p) => [p.num.buffer, p.mat.buffer, p.has.buffer, p.extra.buffer, p.src.buffer])).then((r) => {
      if (!r) return;
      const { sides } = r.out as CoversOut;
      groups.forEach((g, q) => this.covered.set(g.group, { meshes: now[q], sides: sides[q] }));
    });
  }

  /** `cutCovered`'s `known`: a group's sides from `covers`, if its meshes are still as they were (else null: worked out there). */
  readonly knownCover = (group: Object3D, meshes: readonly InstancedMesh[]): Uint8Array | null => {
    const had = this.covered.get(group);
    if (!had || had.meshes.length !== meshes.length) return null;
    for (let q = 0; q < meshes.length; q++) if (!sameState(had.meshes[q], meshes[q])) return null;
    this.stats.jobs['covers used'] = (this.stats.jobs['covers used'] ?? 0) + 1;
    return had.sides;
  };

  /** The build is done: the workers stop (their memory is freed). */
  done(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending.clear();
  }

  /** A line for the console: the workers and what they did, and how long the page waited for them. */
  line(): string {
    const s = this.stats;
    if (s.fallback) return `[work] built on the page (${s.fallback})`;
    if (!s.workers) return '[work] built on the page (no build workers: work=0 or workers=0)';
    const ms = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
    // (the jobs by kind: the longest of those run side by side; each one's steps are in `__mapStats.work.jobs`)
    const kinds: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.jobs)) {
      const m = /^(shape|terrain) \d+$/.exec(k);
      if (m) kinds[m[1]] = Math.max(kinds[m[1]] ?? 0, v);
      else if (['land', 'kits', 'covers', 'vegetation'].includes(k)) kinds[k] = v;
    }
    return `[work] ${s.workers} build workers (of ${s.cores} cores), from ${Math.round(this.born)} ms into the page · in them: ${ms(kinds)} ms · the page waited for: ${ms(s.waited)} ms, then made ${ms(s.onPage)} ms`;
  }

  private waited(part: string, t0: number): void {
    this.stats.waited[part] = performance.now() - t0;
    this.stats.asked[part] = t0 - this.born;
  }

  /** Send a job to worker `w`: its reply, or null if the workers failed. */
  private ask(w: number, job: Job, transfer: Transferable[] = []): Promise<{ out: unknown; ms: number } | null> {
    if (this.failed || !this.workers[w]) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => this.fail(`${job.job} took over ${TIMEOUT / 1000} s`), TIMEOUT);
      this.pending.set(id, { resolve, worker: w, job: job.job, timer });
      this.workers[w].postMessage({ ...job, id }, transfer);
    });
  }

  private reply(r: Reply): void {
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    clearTimeout(p.timer);
    if (!r.ok) {
      p.resolve(null);
      this.fail(`${p.job} in worker ${p.worker + 1}: ${r.error}`);
      return;
    }
    const key = p.job === 'terrain' || p.job === 'shape' ? `${p.job} ${p.worker + 1}` : p.job;
    if (p.job !== 'field') this.stats.jobs[key] = r.ms;
    this.stats.began[key] = r.at - performance.timeOrigin - this.born;
    p.resolve({ out: r.out, ms: r.ms });
  }

  /** The workers failed: every part from now on is built on the page (logged once). */
  private fail(why: string): void {
    if (this.failed) return;
    this.failed = why;
    if (this.stats) this.stats.fallback = why;
    console.warn(`[work] the build workers failed (${why}): building on the page`);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending.clear();
    for (const w of this.workers) w.terminate();
  }
}
