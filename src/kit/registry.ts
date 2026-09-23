import type { KitAsset, KitSection } from './types';

/**
 * Finds kit assets by file: `src/kit/assets/<section>/<slug>.ts` exports the
 * asset as default (files starting with `_` are shared helpers, not assets).
 * Modules load lazily and one at a time, so a broken asset only breaks its own
 * card in the studio.
 */
const modules = import.meta.glob<{ default: KitAsset }>(['./assets/*/*.ts', '!./assets/*/_*.ts']);

export interface KitSectionInfo {
  id: KitSection;
  /** Sheet heading, e.g. "18 — Landscape / Vegetation". */
  sheet: string;
  title: string;
  subtitle: string;
  /** The reference sheet image, under `assets/angkor detail/`. */
  image: string;
}

export const KIT_SECTIONS: KitSectionInfo[] = [
  { id: '18.1', sheet: '18 — Landscape / Vegetation', title: '18.1 Trees', subtitle: 'Trees, palms, bushes and jungle foliage for the temple environment', image: 'section 18/section 18.1.png' },
  { id: '18.2', sheet: '18 — Landscape / Vegetation', title: '18.2 Ground', subtitle: 'Terrain and surface detail for the temple environment', image: 'section 18/section 18.2.png' },
  { id: '19.1', sheet: '19 — Stone / Material System', title: '19.1 Sandstone', subtitle: 'Variations for an authentic and atmospheric temple look', image: 'section 19/85D8F367-EBB2-45B5-94C0-E9ED5A7CE350.PNG' },
  { id: '19.2', sheet: '19 — Stone / Material System', title: '19.2 Stone damage', subtitle: 'Wear, aging and destruction variations', image: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG' },
  { id: '20', sheet: '20 — Small Props', title: '20 Small props', subtitle: 'Every detail brings the temple to life', image: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG' },
];

const idOf = (path: string) => path.replace(/^\.\/assets\//, '').replace(/\.ts$/, '');

/** Every asset id (`18.1/large-tree`…), optionally of one section. */
export function kitAssetIds(section?: KitSection): string[] {
  return Object.keys(modules)
    .map(idOf)
    .filter((id) => !section || id.startsWith(`${section}/`))
    .sort();
}

export async function loadKitAsset(id: string): Promise<KitAsset> {
  const load = modules[`./assets/${id}.ts`];
  if (!load) throw new Error(`no kit asset "${id}" (expected src/kit/assets/${id}.ts)`);
  const asset = (await load()).default;
  if (!asset || typeof asset.build !== 'function') throw new Error(`src/kit/assets/${id}.ts has no default export made with defineKitAsset()`);
  asset.id = id;
  return asset;
}

export interface KitLoadError {
  id: string;
  error: unknown;
}

/** All assets of a section in sheet order; modules that fail are reported, not thrown. */
export async function loadKitSection(section: KitSection): Promise<{ assets: KitAsset[]; errors: KitLoadError[] }> {
  const assets: KitAsset[] = [];
  const errors: KitLoadError[] = [];
  for (const id of kitAssetIds(section)) {
    try {
      assets.push(await loadKitAsset(id));
    } catch (error) {
      errors.push({ id, error });
    }
  }
  assets.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return { assets, errors };
}
