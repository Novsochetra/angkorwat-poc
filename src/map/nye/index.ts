import { Group, Vector3, type Object3D } from 'three';
import type { MapContext, MapFrame, MapPart, Subject } from '../types';
import { buildFarLights, FAR_OFF, FAR_ON, FarCollector, type FarLights } from './_far';
import { GROUND, LAKE_SHORE, LAKE_STAGE, onSquare, SQUARE, STAGE } from './plan';

/**
 * New Year's Eve online (AWP-35, docs/discussion/new-year-online.md), phase 1: the festival square at the
 * foot of Phnom Kulen (part `nye`, built after the hamlets and before the trees: it marks its ground with
 * `field.occupy`, so no tree grows there). Built from the day it ships until the day after the night
 * (clock.ts `squareShown`; `nye=0` leaves it out):
 *
 * - the square (`square.ts`): the paved floor, the gathering ring of light, the lantern walk from the village,
 *   the Bayon-face entrance gate, red banners with the white Angkor Wat, Khmer lamps, the map's own trees with
 *   string lights, the stalls;
 * - the stage (`stage.ts`): the stone platform, its stairs and naga, the gate with a carved temple top and the
 *   countdown board in it (`board.ts`, a canvas drawn once a second).
 *
 * The fireworks are a part of their own (`fireworks.ts`, built only when the show is near: lazy.ts), the
 * night-time hold is main.ts's (clock.ts `nightHeld`), the countdown overlay and the calendar entry `event.ts`,
 * the crowd the people part's (`people/_sceneNye.ts`). Where everything stands: `plan.ts`; when: `clock.ts`.
 * Each piece's module is loaded and built on its own: one that fails is logged and left out.
 *
 * On low (a phone's overview must stay within its 520 draws), each venue seen from more than `FAR_ON` m (`_far.ts`)
 * gives way to its far look: its pieces' `detail` hidden, its blocks in one mesh and every venue's lights in one draw,
 * built here once from the pieces' own meshes; the searchlights and the fireworks stay. From the overview at the
 * finale the event is then 5 draws (was 37‥45).
 */

/** One piece's build: its object, and optional per-frame work, block count and nature book subjects. */
export interface NyePiece {
  object: Object3D;
  update?(f: MapFrame): void;
  blocks?: number;
  subjects?(out: Subject[]): void;
  /**
   * The far look on low (`_far.ts`): the venue it belongs to (0 Kulen's, 1 the lake's), what of it gives way to the far
   * look (its searchlights stay outside it), and the lights only its builder knows (the ring, the board).
   */
  venue?: number;
  detail?: Object3D;
  far?(c: FarCollector): void;
}

/** Where each venue is, for the far look's distance (world m). */
const VENUES = [new Vector3(SQUARE.x, GROUND + 4, SQUARE.z - 6), new Vector3((LAKE_SHORE.x + LAKE_STAGE.x) / 2, GROUND + 2, (LAKE_SHORE.z + LAKE_STAGE.z) / 2)];

type PieceBuilder = (ctx: MapContext) => NyePiece | Promise<NyePiece>;
const PIECES: [string, () => Promise<PieceBuilder>][] = [
  ['square', async () => (await import('./square')).buildNyeSquare],
  ['stage', async () => (await import('./stage')).buildNyeStage],
  ['lake', async () => (await import('./lake')).buildNyeLake],
  ['life', async () => (await import('./_life')).buildNyeLife],
];

export async function buildNye(ctx: MapContext): Promise<MapPart> {
  const object = new Group();
  object.name = 'nye';
  // (the square and the stage: no trees there; the pieces mark what they build round it themselves)
  const { field } = ctx;
  for (let z = STAGE.back - 1; z <= SQUARE.z + SQUARE.rz + 1; z += 2)
    for (let x = SQUARE.x - SQUARE.rx - 1; x <= SQUARE.x + SQUARE.rx + 1; x += 2) if (onSquare(x, z, 1.5)) field.occupy(x, z, x, z);
  const pieces: NyePiece[] = [];
  const times: string[] = [];
  let blocks = 0;
  for (const [name, load] of PIECES) {
    try {
      const t0 = performance.now();
      const piece = await (await load())(ctx);
      pieces.push(piece);
      object.add(piece.object);
      blocks += piece.blocks ?? 0;
      times.push(`${name} ${Math.round(performance.now() - t0)}`);
    } catch (e) {
      console.error(`[map] nye: piece "${name}" failed:`, e);
    }
  }
  // ── The far look on low: each venue's blocks in one mesh, every venue's lights in one draw (`_far.ts`) ──
  let farMeshes: (Object3D | null)[] = [];
  let farLights: FarLights | null = null;
  if (ctx.quality === 'low') {
    const f0 = performance.now();
    const cols = VENUES.map((_, v) => new FarCollector(v));
    for (const p of pieces)
      if (p.detail && p.venue !== undefined) {
        cols[p.venue].gather(p.detail);
        p.far?.(cols[p.venue]);
      }
    farMeshes = cols.map((c, v) => c.buildBlocks(`nye:far${v}`));
    for (const m of farMeshes) if (m) object.add(m);
    farLights = buildFarLights(cols);
    if (farLights) object.add(farLights.mesh);
    times.push(`far look ${Math.round(performance.now() - f0)} (${cols.map((c) => `${c.blocks.boxes.length} blocks, ${c.lights.length / 8} lights`).join(' · ')})`);
  }
  console.info(`[map] nye: built ${times.join(', ')} ms`);
  const far = VENUES.map(() => false);
  let frames = 0;
  return {
    name: 'nye',
    object,
    blocks,
    update(f) {
      for (const p of pieces) p.update?.(f);
      if (!farLights && !farMeshes.length) return;
      // (everything drawn in the first frames, so every program compiles at load; then each venue past `FAR_ON` m looks far)
      const first = frames++ < 4;
      for (const [v, at] of VENUES.entries()) {
        const d = f.camera.position.distanceTo(at);
        far[v] = !first && (far[v] ? d > FAR_OFF : d > FAR_ON);
      }
      for (const p of pieces) if (p.detail && p.venue !== undefined) p.detail.visible = !far[p.venue];
      for (const [v, m] of farMeshes.entries()) if (m) m.visible = first || far[v];
      if (farLights) {
        const t = Math.max(0, Math.min(1, (f.night - 0.3) / 0.45));
        // (in the first frames shown, whatever the hour, so its program compiles at load)
        farLights.update(first ? [true, true] : far, first ? 1 : t * t * (3 - 2 * t));
      }
    },
    subjects(out) {
      for (const p of pieces) p.subjects?.(out);
    },
  };
}
