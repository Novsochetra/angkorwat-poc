import { packedBuffers, packVoxelMesh, shownSides, TraceTable } from '../../voxel/VoxelMesh';
import { buildHeightField, fieldData, firstShape, HeightField } from '../heightfield';
import { layTerrain, shareChunks, terrainMeshOptions } from '../terrain/lay';
import { makeKits, plantJungle, type Kits } from '../vegetation';
import type { CoversOut, LandOut, Reply, Request, ShapeOut, TerrainOut, VegetationOut } from './protocol';
import { encodeBuilders, traceStacks, unpackBoxes } from './transfer';

/**
 * A build worker (build.ts starts a few): the map's heavy pure-data work off
 * the page's thread — the land, the land's blocks packed into their meshes'
 * arrays (a share of the chunks each), the jungle planted. The same code as
 * on the page, on a copy of the land: the page gets the same numbers, and
 * makes only the three.js objects. Jobs run one after another, in the order
 * asked (protocol.ts).
 */

/** This worker's copy of the land (built here, or sent). */
let field: HeightField | null = null;
/** The jungle's prototypes, made early (`kits`). */
let kits: Kits | null = null;

const land = (): HeightField => {
  if (!field) throw new Error('build worker: no land yet');
  return field;
};

function run(r: Request): [unknown, ArrayBufferLike[]] {
  switch (r.job) {
    case 'shape': {
      const out: ShapeOut = { rows: firstShape(r.k0, r.k1) };
      return [out, [out.rows.buffer]];
    }
    case 'land': {
      const steps: Record<string, number> = {};
      field = buildHeightField(steps, r.first);
      // (a copy: this worker keeps its own for the land's blocks)
      const out: LandOut = { field: fieldData(field), steps };
      return [out, []];
    }
    case 'field':
      field = new HeightField(r.field);
      return [null, []];
    case 'terrain': {
      const f = land();
      const t0 = performance.now();
      const steps: Record<string, number> = {};
      const mine = shareChunks(f, r.part, r.of);
      steps.share = performance.now() - t0;
      const own = new Uint8Array(Math.max(0, ...mine) + 1);
      for (const n of mine) own[n] = 1;
      const before = r.report ? f.occupied.slice() : null;
      const laid = layTerrain(f, r.of > 1 ? (n) => own[n] === 1 : undefined, steps);
      const t1 = performance.now();
      const traces = new TraceTable();
      const low = r.quality === 'low';
      const transfer: ArrayBufferLike[] = [];
      const chunks = mine.map((n) => {
        const [near, far] = laid.chunks[n];
        return {
          n,
          near: near.boxes.length ? packVoxelMesh(near, terrainMeshOptions(n, 0, low, laid.ground), traces, steps) : null,
          far: far.boxes.length ? packVoxelMesh(far, terrainMeshOptions(n, 1, low, laid.ground), traces, steps) : null,
        };
      });
      for (const c of chunks) for (const p of [c.near, c.far]) if (p) packedBuffers(p, transfer);
      const out: TerrainOut = { chunks, traces: traceStacks(traces), lay: t1 - t0, pack: performance.now() - t1, steps };
      if (before) {
        const took: number[] = [];
        for (let c = 0; c < before.length; c++) if (f.occupied[c] && !before[c]) took.push(c);
        out.rocks = Int32Array.from(took);
        out.seen = laid.seen.slice();
        transfer.push(out.rocks.buffer, out.seen.buffer);
      }
      return [out, transfer];
    }
    case 'kits':
      kits = makeKits();
      return [null, []];
    case 'covers': {
      const out: CoversOut = { sides: r.groups.map((g) => shownSides(unpackBoxes(g, []))) };
      return [out, out.sides.map((a) => a.buffer)];
    }
    case 'vegetation': {
      const f = land();
      // (the land as the page has it now: what the landmarks, the road, the sites and the reserved spots took)
      f.surface.set(r.surface);
      f.occupied.set(r.occupied);
      const planted = plantJungle(f, r.density, kits ?? undefined);
      const traces = new TraceTable();
      const transfer: ArrayBufferLike[] = [];
      const out: VegetationOut = { planted: encodeBuilders(planted, traces, transfer), traces: traceStacks(traces) };
      return [out, transfer];
    }
    default:
      throw new Error(`build worker: no job "${(r as { job: unknown }).job}"`);
  }
}

self.onmessage = (e: MessageEvent<Request>) => {
  const r = e.data;
  const t0 = performance.now();
  let reply: Reply;
  let transfer: ArrayBufferLike[] = [];
  try {
    const [out, moved] = run(r);
    reply = { id: r.id, ok: true, out, ms: performance.now() - t0, at: performance.timeOrigin + t0 };
    transfer = moved;
  } catch (err) {
    reply = { id: r.id, ok: false, error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) };
  }
  (self as unknown as Worker).postMessage(reply, transfer as Transferable[]);
};
