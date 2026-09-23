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

const AVENUE_W = 6;
const AVENUE = { z0: 64, z1: -150 };
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

  // ── Lawn and avenue ────────────────────────────────────────────────────
  // One soil block: the pattern draws the grass texels over the whole lawn.
  w.chunk('lawn').box(0, -0.5, -40, 280, 1, 260, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 0.94 }) });
  w.colliders.addBox(-140, -1, -170, 140, 0, 90);
  const paving = new BlockSet(0.125);
  for (let z = AVENUE.z1; z < AVENUE.z0; z += 0.75)
    masonry(paving, -AVENUE_W / 2, -0.25, z, AVENUE_W / 2, 0.0625, z + 0.75, {
      length: [0.5, 1.25],
      course: 0.3125,
      axis: 'x',
      palette: [...SANDSTONE.clean, ...SANDSTONE.weathered.slice(0, 2)],
      style: { surf: stoneSurf({ moss: 0.12, lichen: 0.1, stain: 0.12 }) },
      seed: Math.round(z * 4),
    });
  paving.emit(w.chunk('avenue'), { seed: 2 });
  w.colliders.addBox(-AVENUE_W / 2, -0.25, AVENUE.z1, AVENUE_W / 2, 0.0625, AVENUE.z0);
  spawns.push({ name: 'Specimen garden (sections 18–20)', x: 0, y: 0.07, z: AVENUE.z0 - 4, yaw: Math.PI });

  // ── Specimen garden: a row per section, a plot per asset ─────────────────
  const order = ['18.2', '19.1', '19.2', '20', '18.1'] as const;
  let rowZ = AVENUE.z0 - 8;
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
    }
    if (x > GARDEN_X) spawns.push({ name: `Garden: ${section.title}`, x: GARDEN_X - 2.5, y: 0, z: rowZ - 1, yaw: Math.PI / 2 });
    rowZ -= rowDepth + (sectionId === '20' ? 12 : 6);
  }

  // ── Dioramas along the west side of the avenue, facing it ─────────────────
  const ctx = kitSceneContext((id, e) => console.warn(`[kit] level: scene asset ${id} unavailable`, e));
  let sceneZ = AVENUE.z0 - 8;
  for (const id of kitSceneIds()) {
    try {
      const scene = await loadKitScene(id);
      const p = new PieceBuilder();
      await scene.build(ctx, p);
      const [sw, sd] = scene.size;
      // Turned a quarter so the scene's front (+z) faces the avenue (+x).
      const at = { x: -AVENUE_W / 2 - 3 - sd / 2, y: 0, z: sceneZ - sw / 2, turn: 1 };
      placePiece({ ...into(`scene:${id}`), extra: (o) => extras.add(o) }, p.done(), at);
      const sp = scene.spawn ?? { x: 0, z: sd / 2 + 2, yaw: 180 };
      // (scene space → level: turn 1 maps (x, z) to (z, −x); yaw turns by +90°)
      spawns.push({ name: `Scene: ${scene.name}`, x: at.x + sp.z, y: 0, z: at.z - sp.x, yaw: ((sp.yaw + 90) * Math.PI) / 180 });
      labels.push({ x: at.x, z: at.z, name: scene.name, detail: scene.source });
      sceneZ -= sw + 8;
    } catch (e) {
      console.warn(`[kit] level: scene ${id} failed`, e);
    }
  }

  const root = new Group();
  root.name = 'KitWorld';
  root.add(w.build(), extras);
  return {
    root,
    colliders: w.colliders,
    spawns,
    baseGround: 0,
    stats: { instances: w.instanceCount },
    labels,
    update: () => {},
  };
}
