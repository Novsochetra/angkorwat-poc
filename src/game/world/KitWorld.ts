import { Group } from 'three';
import { BlockSet, masonry } from '../../kit/BlockSet';
import { SANDSTONE, SOIL } from '../../kit/palette';
import { PieceBuilder } from '../../kit/PieceBuilder';
import { footprint, placePiece, type PlaceTarget } from '../../kit/place';
import { KIT_SECTIONS, loadKitSection } from '../../kit/registry';
import { kitSceneContext, kitSceneIds, loadKitScene } from '../../kit/scene';
import { soilSurf, stoneSurf } from '../../kit/surface';
import type { KitPiece } from '../../kit/types';
import type { VoxelQuality } from '../../voxel/VoxelMesh';
import type { AngkorWorld, SpawnPoint } from './AngkorScaleWorld';
import { WorldBuilder } from './WorldBuilder';

/** A named spot the HUD can point out ("near: Large tree · 22.4 m tall"). */
export interface KitLabel {
  x: number;
  z: number;
  name: string;
  detail: string;
}

export type KitWorld = AngkorWorld & { labels: KitLabel[] };

/** x0, z0, x1, z1 */
type Rect = [number, number, number, number];

/** The parts of `r` outside `hole` (up to four rectangles). */
function subtract(r: Rect, hole: Rect): Rect[] {
  const [x0, z0, x1, z1] = r;
  const [hx0, hz0, hx1, hz1] = hole;
  if (hx0 >= x1 || hx1 <= x0 || hz0 >= z1 || hz1 <= z0) return [r];
  const out: Rect[] = [];
  if (hz0 > z0) out.push([x0, z0, x1, hz0]);
  if (hz1 < z1) out.push([x0, hz1, x1, z1]);
  const [mz0, mz1] = [Math.max(z0, hz0), Math.min(z1, hz1)];
  if (hx0 > x0) out.push([x0, mz0, hx0, mz1]);
  if (hx1 < x1) out.push([hx1, mz0, x1, mz1]);
  return out;
}

const AVENUE_W = 6;
/** North end of the avenue (it runs south, −z, past the last row / scene). */
const AVENUE_Z0 = 64;
const GARDEN_X = 9;

/**
 * Walkable test level for the world kit (`index.html?level=kit`): every asset
 * of sections 18–20 in a specimen garden east of a paved avenue — one row per
 * sheet section, each asset on its own plot with its variants lined up behind
 * it — and the kit's dioramas along the west side. Walk the 1.70 m explorer
 * among them to judge the sizes at true scale.
 */
export async function buildKitWorld(quality: VoxelQuality = 'medium'): Promise<KitWorld> {
  const w = new WorldBuilder(quality);
  const labels: KitLabel[] = [];
  const spawns: SpawnPoint[] = [];
  const into = (chunk: string): PlaceTarget => ({
    voxels: w.chunk(chunk),
    collider: (c) => w.colliders.addBox(c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2], c.noStand ? { noStand: true } : {}),
  });
  const extras = new Group();
  extras.name = 'kit-extras';

  // ── Specimen garden: a row per section, a plot per asset ─────────────────
  const order = ['18.2', '19.1', '19.2', '20', '18.1'] as const;
  let rowZ = AVENUE_Z0 - 8;
  // How far the content reaches (east, west, south): the lawn and the avenue are sized to it.
  let east = GARDEN_X;
  let west = -AVENUE_W / 2;
  for (const sectionId of order) {
    const section = KIT_SECTIONS.find((s) => s.id === sectionId)!;
    const { assets, errors } = await loadKitSection(sectionId);
    for (const e of errors) console.warn(`[kit] level: ${e.id} failed to load`, e.error);
    let x = GARDEN_X;
    let rowDepth = 0;
    for (const asset of assets) {
      // Its variants lined up behind each other on one plot.
      const built: { piece: KitPiece; name: string; fp: [number, number, number, number] }[] = [];
      for (const v of asset.variants) {
        try {
          const piece = asset.build({ variant: v.id, seed: 1 });
          built.push({ piece, name: v.name, fp: footprint(piece) });
        } catch (e) {
          console.warn(`[kit] level: ${asset.id} · ${v.id} failed`, e);
        }
      }
      if (!built.length) continue;
      const plotW = Math.max(...built.map((b) => b.fp[2] - b.fp[0]));
      let z = rowZ;
      for (const b of built) {
        const depth = b.fp[3] - b.fp[1];
        const cx = x + plotW / 2 - (b.fp[0] + b.fp[2]) / 2;
        const cz = z - b.fp[3];
        // Specimens stand on the lawn: ground tiles (walkable top at y = 0) are lifted so their soil shows.
        const size = b.piece.voxels.bounds();
        const lift = Math.max(0, -size.min[1]);
        placePiece({ ...into(`garden:${sectionId}`), extra: (o) => extras.add(o) }, b.piece, { x: cx, y: lift, z: cz });
        labels.push({ x: x + plotW / 2, z: z - depth / 2, name: `${asset.name}${asset.variants.length > 1 ? ` — ${b.name}` : ''}`, detail: `§${asset.section} ${asset.order} · ${(size.max[1] - size.min[1]).toFixed(2)} m tall · real ${asset.size.real}` });
        z -= depth + (sectionId === '18.1' ? 4 : 1.5);
      }
      rowDepth = Math.max(rowDepth, rowZ - z);
      x += plotW + (sectionId === '18.1' ? 6 : 2.5);
      east = Math.max(east, x);
    }
    if (x > GARDEN_X) spawns.push({ name: `Garden: ${section.title}`, x: GARDEN_X - 2.5, y: 0, z: rowZ - 1, yaw: Math.PI / 2 });
    rowZ -= rowDepth + (sectionId === '20' ? 12 : 6);
  }

  // ── Dioramas along the west side of the avenue, facing it ─────────────────
  const ctx = kitSceneContext((id, e) => console.warn(`[kit] level: scene asset ${id} unavailable`, e));
  let sceneZ = AVENUE_Z0 - 8;
  /**
   * Scene footprints and how deep each scene goes (moats, ponds): scenes bring
   * their own ground and colliders, so the lawn only runs under them as a floor
   * below their lowest block.
   */
  const sceneGround: { rect: Rect; floor: number }[] = [];
  for (const id of kitSceneIds()) {
    try {
      const scene = await loadKitScene(id);
      const p = new PieceBuilder();
      const t = performance.now();
      await scene.build(ctx, p);
      const piece = p.done();
      console.info(`[kit] level: scene ${id}: ${piece.voxels.boxes.length} blocks in ${(performance.now() - t).toFixed(0)} ms`);
      const [sw, sd] = scene.size;
      // Turned a quarter so the scene's front (+z) faces the avenue (+x).
      const at = { x: -AVENUE_W / 2 - 3 - sd / 2, y: 0, z: sceneZ - sw / 2, turn: 1 };
      placePiece({ ...into(`scene:${id}`), extra: (o) => extras.add(o) }, piece, at);
      sceneGround.push({ rect: [at.x - sd / 2, at.z - sw / 2, at.x + sd / 2, at.z + sw / 2], floor: Math.min(0, piece.voxels.bounds().min[1]) - 0.02 });
      const sp = scene.spawn ?? { x: 0, z: sd / 2 + 2, yaw: 180 };
      // (scene space → level: turn 1 maps (x, z) to (z, −x); yaw turns by +90°)
      spawns.push({ name: `Scene: ${scene.name}`, x: at.x + sp.z, y: 0, z: at.z - sp.x, yaw: ((sp.yaw + 90) * Math.PI) / 180 });
      labels.push({ x: at.x, z: at.z, name: scene.name, detail: scene.source });
      west = Math.min(west, at.x - sd / 2);
      sceneZ -= sw + 8;
    } catch (e) {
      console.warn(`[kit] level: scene ${id} failed`, e);
    }
  }

  // ── Lawn and avenue, sized to what was laid out ───────────────────────────
  const south = Math.min(rowZ, sceneZ) - 6;
  const [lx0, lx1, lz0, lz1] = [west - 12, east + 12, south - 12, AVENUE_Z0 + 24];
  // A few big soil blocks: the pattern draws the grass texels over them. Under
  // each scene the lawn drops below its lowest block, so it neither z-fights
  // with the scene's ground nor fills its moats, yet no hole opens where a
  // scene leaves ground uncovered.
  // (merge ±x ±z: no bevel groove where two lawn blocks meet)
  const lawnSurf = { surf: soilSurf({ grass: 0.94 }), merge: 1 | 2 | 16 | 32 };
  const lawn = w.chunk('lawn');
  let open: Rect[] = [[lx0, lz0, lx1, lz1]];
  for (const g of sceneGround) open = open.flatMap((r) => subtract(r, g.rect));
  for (const [x0, z0, x1, z1] of open) {
    lawn.box((x0 + x1) / 2, -0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, SOIL.dirt[0], 'soil', lawnSurf);
    w.colliders.addBox(x0, -1, z0, x1, 0, z1);
  }
  for (const { rect: [x0, z0, x1, z1], floor } of sceneGround) {
    lawn.box((x0 + x1) / 2, floor - 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, SOIL.dirt[0], 'soil', lawnSurf);
    w.colliders.addBox(x0, floor - 1, z0, x1, floor, z1);
  }
  const paving = new BlockSet(0.125);
  for (let z = south; z < AVENUE_Z0; z += 0.75)
    masonry(paving, -AVENUE_W / 2, -0.25, z, AVENUE_W / 2, 0.0625, z + 0.75, {
      length: [0.5, 1.25],
      course: 0.3125,
      axis: 'x',
      // Pale causeway slabs: clean and cracked stone (darker tones read as holes at this scale).
      palette: [...SANDSTONE.clean, ...SANDSTONE.cracked],
      style: { surf: stoneSurf({ moss: 0.12, lichen: 0.1, stain: 0.12 }) },
      seed: Math.round(z * 4),
    });
  paving.emit(w.chunk('avenue'), { seed: 2 });
  w.colliders.addBox(-AVENUE_W / 2, -0.25, south, AVENUE_W / 2, 0.0625, AVENUE_Z0);
  spawns.unshift({ name: 'Specimen garden (sections 18–20)', x: 0, y: 0.07, z: AVENUE_Z0 - 4, yaw: Math.PI });

  const root = new Group();
  root.name = 'KitWorld';
  root.add(w.build(), extras);
  return {
    root,
    colliders: w.colliders,
    spawns,
    // Below the deepest scene (moats, ponds), so the explorer can walk down into them.
    baseGround: Math.min(0, ...sceneGround.map((g) => g.floor)) - 1,
    stats: { instances: w.instanceCount },
    labels,
    update: () => {},
  };
}
