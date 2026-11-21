import { Group, type Object3D } from 'three';
import type { MapContext, MapFrame, MapPart, Subject } from '../types';
import { onSquare, SQUARE, STAGE } from './plan';

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
 */

/** One piece's build: its object, and optional per-frame work, block count and nature book subjects. */
export interface NyePiece {
  object: Object3D;
  update?(f: MapFrame): void;
  blocks?: number;
  subjects?(out: Subject[]): void;
}

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
  console.info(`[map] nye: built ${times.join(', ')} ms`);
  return {
    name: 'nye',
    object,
    blocks,
    update(f) {
      for (const p of pieces) p.update?.(f);
    },
    subjects(out) {
      for (const p of pieces) p.subjects?.(out);
    },
  };
}
