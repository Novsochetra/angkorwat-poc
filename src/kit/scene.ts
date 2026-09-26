import { loadKitAsset } from './registry';
import type { PieceBuilder } from './PieceBuilder';
import type { KitPiece } from './types';

/**
 * Dioramas made of kit assets — the sheets' "Environment / usage examples"
 * (a tree gripping a temple wall, palms along a causeway, a shrine with
 * offerings…). One module per scene: `src/kit/scenes/<slug>.ts`, default export
 * made by {@link defineKitScene}. The studio renders them (`studio.html?scene=`)
 * and the walkable kit level (`game.html?level=kit`) lays them out at true scale.
 */
export interface KitSceneContext {
  /**
   * Build a kit asset by id (`18.1/large-tree`…). Resolves to null when the
   * asset doesn't exist yet or fails, so a scene still builds without it.
   */
  get(id: string, o?: { variant?: string; seed?: number; height?: number }): Promise<KitPiece | null>;
}

export interface KitScene {
  /** File slug, filled in by the registry. */
  id: string;
  name: string;
  caption: string;
  /** Which sheet panel it recreates, e.g. "18.1 Environment examples · Tree near temple wall". */
  source: string;
  /** Footprint (metres, x × z) centred on the origin; the level reserves this much room. */
  size: [number, number];
  /** Studio camera: azimuth / elevation (degrees) and distance (metres) around `target`. */
  camera?: { az: number; el: number; dist: number; target?: [number, number, number] };
  /** Where the explorer arrives in the kit level (scene space) and which way it faces (degrees, 0 = +Z). */
  spawn?: { x: number; z: number; yaw: number };
  build(ctx: KitSceneContext, p: PieceBuilder): Promise<void>;
}

export function defineKitScene(scene: Omit<KitScene, 'id'> & { id?: string }): KitScene {
  return { id: '', ...scene };
}

const modules = import.meta.glob<{ default: KitScene }>(['./scenes/*.ts', '!./scenes/_*.ts']);

export function kitSceneIds(): string[] {
  return Object.keys(modules)
    .map((p) => p.replace(/^\.\/scenes\//, '').replace(/\.ts$/, ''))
    .sort();
}

export async function loadKitScene(id: string): Promise<KitScene> {
  const load = modules[`./scenes/${id}.ts`];
  if (!load) throw new Error(`no kit scene "${id}" (expected src/kit/scenes/${id}.ts)`);
  const scene = (await load()).default;
  scene.id = id;
  return scene;
}

/** A context that builds assets through the registry (cached per id + options). */
export function kitSceneContext(onError: (id: string, e: unknown) => void = (id, e) => console.warn(`[kit] scene asset ${id}:`, e)): KitSceneContext {
  const cache = new Map<string, Promise<KitPiece | null>>();
  return {
    get(id, o = {}) {
      const key = `${id}|${o.variant ?? ''}|${o.seed ?? 1}|${o.height ?? ''}`;
      let hit = cache.get(key);
      if (!hit) {
        hit = loadKitAsset(id)
          .then((a) => a.build({ variant: o.variant ?? a.variants[0].id, seed: o.seed ?? 1, height: o.height }))
          .catch((e: unknown) => {
            onError(id, e);
            return null;
          });
        cache.set(key, hit);
      }
      return hit;
    },
  };
}
