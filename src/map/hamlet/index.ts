import { Group, type Object3D } from 'three';
import type { MapContext, MapFrame, MapPart, Subject } from '../types';

/**
 * The settled places added round the map (part `hamlet`, built after the
 * paddies and before the trees: each piece marks the ground it builds on
 * with `field.occupy`, so no tree grows there):
 *
 * - the sugar-palm village on the east lowland (`_eastVillage.ts`, layout.ts
 *   `EAST_VILLAGE`), "the other side" from the floating village;
 * - its morning market (`_market.ts`, `MARKET`);
 * - the palm sugar grove and the family's cooking hut (`_palmSugar.ts`, `PALM_GROVE`);
 * - the picnic place below the Kulen stream's falls (`_kulenPicnic.ts`, `KULEN_PICNIC`);
 * - the little hamlet behind Angkor Wat (`_backHamlet.ts`, `BACK_HAMLET`).
 *
 * Their people are people-part scenes (`people/_sceneMarket.ts`, …). Each
 * piece's module is loaded and built on its own: one that fails to load or
 * to build is logged and left out, the others still stand. All of them are off the picker's frame: seen while
 * roaming, so each keeps to a small budget of blocks and draws and hides
 * what is far (see docs/map-work/BRIEF.md, "Budgets").
 */

/** One place's build: its object, and optional per-frame work, block count and nature book subjects. */
export interface HamletPiece {
  object: Object3D;
  update?(f: MapFrame): void;
  blocks?: number;
  subjects?(out: Subject[]): void;
}

type PieceBuilder = (ctx: MapContext) => HamletPiece;
/** The pieces in build order, each its own module (loaded on its own: see above). */
const PIECES: [string, () => Promise<PieceBuilder>][] = [
  ['eastVillage', async () => (await import('./_eastVillage')).buildEastVillage],
  ['market', async () => (await import('./_market')).buildMarket],
  ['palmSugar', async () => (await import('./_palmSugar')).buildPalmSugar],
  ['kulenPicnic', async () => (await import('./_kulenPicnic')).buildKulenPicnic],
  ['backHamlet', async () => (await import('./_backHamlet')).buildBackHamlet],
];

export async function buildHamlets(ctx: MapContext): Promise<MapPart> {
  const object = new Group();
  object.name = 'hamlet';
  const pieces: HamletPiece[] = [];
  const times: string[] = [];
  let blocks = 0;
  // (the modules load side by side; the pieces then build in order)
  const loaded = await Promise.allSettled(PIECES.map(([, load]) => load()));
  for (const [k, [name]] of PIECES.entries()) {
    const got = loaded[k];
    if (got.status === 'rejected') {
      console.error(`[map] hamlet piece "${name}" failed to load:`, got.reason);
      continue;
    }
    const t0 = performance.now();
    try {
      const p = got.value(ctx);
      pieces.push(p);
      object.add(p.object);
      blocks += p.blocks ?? 0;
      times.push(`${name} ${Math.round(performance.now() - t0)} ms${p.blocks ? ` ${p.blocks} blocks` : ''}`);
    } catch (e) {
      console.error(`[map] hamlet piece "${name}" failed:`, e);
    }
  }
  console.info(`[map] hamlet: ${times.join(' · ')}`);
  const broken = new Set<HamletPiece>();
  return {
    name: 'hamlet',
    object,
    blocks,
    update(f) {
      for (const p of pieces) {
        if (!p.update || broken.has(p)) continue;
        try {
          p.update(f);
        } catch (e) {
          broken.add(p);
          console.error('[map] hamlet piece update failed:', e);
        }
      }
    },
    subjects(out) {
      for (const p of pieces) p.subjects?.(out);
    },
  };
}
