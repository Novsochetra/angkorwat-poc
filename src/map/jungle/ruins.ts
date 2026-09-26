import { Group } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate, splitByPlace } from '../cull';
import { JUNGLE_SITES, type JungleSiteKind } from '../layout';
import type { MapContext, MapFrame, MapPart } from '../types';
import { ShrineGlow, type ShrineLights } from './_incense';
import { SiteFrame } from './_ruinFrame';
import { forestBuddha, kulenShrine, lakeShrine, spiritHouse } from './_ruinShrines';
import { fallenFace, rootGate, ruinWall } from './_ruinStones';

/**
 * Part `jungle`: the hidden ruins and shrines at the jungle sites
 * (layout.ts `JUNGLE_SITES`), each in its clearing, facing its trail — the
 * fallen face, the root gate (the back trail runs through it), the carved
 * lintel, the forest Buddha, the spirit house, the lake shrine and the
 * Kulen shrine. (The monk's hut, the woodcutters' camp, the swing, the pool
 * and the bridges are another part's.)
 *
 * Solid voxels on the land (1 m blocks, 0.5 m and finer for carvings and
 * offerings), one mesh per block family for each site (sites a stone's
 * throw apart share one), so the sites out of view are not drawn and cast
 * shadows only while those can be seen (cull.ts); the explorer walks among
 * them and through the root gate. Incense smoke, candle flames and
 * their night halos are glow only (`_incense.ts`: no light; not voxels, so
 * the walk map leaves them out). Each worship spot (roam/_worship.ts) is
 * `KNEEL` in _ruinShrines.ts, in map metres.
 */

type SiteBuilder = (fr: SiteFrame, lights: ShrineLights) => void;

/** One builder per kind; the shrines differ by site. */
const KINDS: Partial<Record<JungleSiteKind, SiteBuilder>> = {
  fallenHead: fallenFace,
  rootGate,
  ruinWall,
  buddha: forestBuddha,
};
const SHRINES: Record<string, SiteBuilder> = {
  'lake-shrine': lakeShrine,
  'kulen-shrine': kulenShrine,
  'spirit-house': spiritHouse,
};

/** Sites closer than this share their meshes (m). */
const JOIN = 120;

export function buildJungleRuins(ctx: MapContext): MapPart {
  const b = new VoxelBuilder();
  const lights: ShrineLights = { candles: [], tips: [], smoke: [], halos: [] };
  const built: { x: number; z: number }[] = [];
  for (const site of JUNGLE_SITES) {
    const make = site.kind === 'shrine' ? SHRINES[site.id] : KINDS[site.kind];
    if (!make) continue;
    const fr = new SiteFrame(ctx.field, site);
    make(fr, lights);
    fr.emit(b);
    built.push(site);
    // (the jungle keeps off what stands there; the site's own trees cover it)
    const [x0, z0, x1, z1] = fr.footprint(1);
    ctx.field.occupy(x0, z0, x1, z1);
  }
  const glow = new ShrineGlow(lights);
  const object = new Group();
  object.name = 'jungle';
  for (const part of splitByPlace(b, built, JOIN).parts) object.add(buildVoxelMesh(part, { quality: 'medium', name: 'jungle' }));
  object.add(glow.object);
  const shadows = new ShadowGate(true).addAll(object);
  return {
    name: 'jungle',
    object,
    blocks: b.boxes.length,
    update: (f: MapFrame) => {
      shadows.update(f);
      glow.update(f);
    },
  };
}
