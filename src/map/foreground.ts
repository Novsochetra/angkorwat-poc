import { Group, PerspectiveCamera, Vector3 } from 'three';
import { AngkorExplorer, OUTFITS } from '../character/AngkorExplorer';
import { LEAF, SANDSTONE } from '../kit/palette';
import { leafSurf, stoneSurf } from '../kit/surface';
import { traceSource } from '../feedback/sourceTrace';
import { hash3 } from '../voxel/random';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import { EXPLORER_SPOT, OVERVIEW } from './layout';
import type { MapContext, MapFrame, MapPart } from './types';

/** Size of the ledge's sandstone blocks (m): the game's own temple block. */
const B = 0.5;
/** While roaming, the ledge shows only while the explorer is this close to it (m). */
const LEDGE_SEEN = 90;

/**
 * The foreground: a mossy sandstone ledge close to the camera, bottom left,
 * with the explorer standing on its corner looking out over the highlands
 * (true size, 1.70 m, so the map reads as far away and huge).
 */
export interface Foreground extends MapPart {
  explorer: AngkorExplorer;
  feet: Vector3;
  /** Facing on the ledge (radians, like `rotation.y`). */
  yaw: number;
  /** The explorer leaves the ledge to roam (true), or is back (false): the ledge stops / starts driving him. */
  release(roaming: boolean): void;
}

export function buildForeground(ctx: MapContext): Foreground {
  const feet = explorerFeet();
  const object = new Group();
  object.name = 'foreground';

  // Ledge: blocks stepping down to the front and right of the explorer's
  // corner (as in the concept art), a higher boulder behind on the left.
  const b = new VoxelBuilder();
  const src = traceSource();
  const [x0, z0] = [feet.x - 7, feet.z - 2.5];
  const g = b.grid({ cell: B, origin: [x0, feet.y - 7, z0], mat: 'sandstone', jitter: 0.04, ao: 0.3, seed: 5 });
  const [ni, nk] = [20, 13];
  const base = 14; // cells from the grid floor to the explorer's feet
  for (let i = 0; i < ni; i++)
    for (let k = 0; k < nk; k++) {
      const x = x0 + (i + 0.5) * B - feet.x;
      const z = z0 + (k + 0.5) * B - feet.z;
      const n = hash3(i >> 1, 0, k >> 1, 3);
      // Steps down to the right and to the front; ragged outline.
      let top = base - Math.floor(Math.max(0, x - 0.9) / 0.6) - Math.floor(Math.max(0, z - 1.2) / 0.9);
      if (x < -3.2 && z < 1.5) top += 1 + (n < 0.4 ? 1 : 0);
      if (n < 0.18) top -= 1;
      if (x > 1.7 + n * 1.0 || top < base - 6) continue;
      for (let j = 0; j < top; j++) {
        const t = j === top - 1;
        const moss = t ? 0.45 + hash3(i, j, k, 9) * 0.45 : hash3(i, j, k, 10) * 0.2;
        g.put(i, j, k, { color: SANDSTONE.mossy[Math.floor(hash3(i, j, k, 1) * SANDSTONE.mossy.length)], surf: stoneSurf({ moss, stain: 0.25, lichen: 0.12 }), src });
      }
    }
  g.commit();

  /** A round leafy clump of 0.25–0.5 m leaf blocks. */
  const bush = (cx: number, cy: number, cz: number, r: number, cell: number, seed: number, tones: readonly number[]) => {
    const n = Math.round((2 * r) / cell);
    const lg = b.grid({ cell, origin: [cx - r, cy - r * 0.6, cz - r], mat: 'leaves', jitter: 0.06, ao: 0.4, seed });
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let k = 0; k < n; k++) {
          const dx = (i + 0.5) / n - 0.5;
          const dy = (j + 0.5) / n - 0.3;
          const dz = (k + 0.5) / n - 0.5;
          const lump = (hash3(i >> 1, j >> 1, k >> 1, seed) - 0.5) * 0.22;
          if (Math.hypot(dx, dy * 1.25, dz) + lump > 0.5) continue;
          // Lighter on top, darker underneath.
          const shade = 0.8 + 0.35 * ((j + 0.5) / n);
          lg.put(i, j, k, { color: tones[Math.floor(hash3(i, j, k, seed + 1) * tones.length)], surf: leafSurf({ yellow: 0.08, flowers: seed === 13 ? 0.08 : 0 }), shade, src });
        }
    lg.commit();
  };
  bush(feet.x - 3.6, feet.y + 1.1, feet.z - 1.2, 1.5, 0.25, 11, LEAF.bright);
  bush(feet.x - 5.4, feet.y - 0.2, feet.z + 3.2, 1.3, 0.25, 12, LEAF.jungle);
  // Framing leaves near the camera: the lower right corner and the left edge.
  const cr = screenPoint(0.985, 1.05, 10);
  bush(cr.x, cr.y, cr.z, 1.9, 0.5, 13, LEAF.bright);
  const cl = screenPoint(-0.01, 0.64, 14);
  bush(cl.x, cl.y, cl.z, 1.7, 0.5, 14, LEAF.jungle);
  const ledge = buildVoxelMesh(b, { quality: 'high', name: 'foreground:ledge' });
  object.add(ledge);

  // Hat and the big pack, as in the concept art.
  const explorer = new AngkorExplorer({ quality: 'high', outfit: { ...OUTFITS.explorerGear, hat: true } });
  explorer.blinking = !ctx.shot;
  explorer.object.position.copy(feet);
  const [fx, , fz] = EXPLORER_SPOT.facing;
  const yaw = Math.atan2(fx - feet.x, fz - feet.z);
  explorer.object.rotation.y = yaw;
  object.add(explorer.object);
  let roaming = false;

  return {
    name: 'foreground',
    object,
    explorer,
    feet,
    yaw,
    blocks: b.boxes.length,
    release(on) {
      roaming = on;
    },
    update(f: MapFrame) {
      // The ledge hangs in the air by the overview camera: seen from the land
      // it would float in the sky, so it goes once the explorer is far off.
      ledge.visible = !roaming || explorer.object.position.distanceTo(feet) < LEDGE_SEEN;
      if (roaming) return;
      // After dark the explorer lights a lantern.
      const lantern = f.night > 0.55;
      if (lantern !== (explorer.currentOutfit.held === 'lantern')) explorer.setOutfit({ held: lantern ? 'lantern' : 'none' });
      explorer.propLightBoost = 1 + f.night * 5;
      explorer.update(f.dt);
    },
  };
}

/** Map point under a screen spot of the overview camera (0‥1 from the top left), `distance` m away. */
export function screenPoint(sx: number, sy: number, distance: number): Vector3 {
  const cam = new PerspectiveCamera(OVERVIEW.fov, 16 / 9, 0.5, 5000);
  cam.position.set(...OVERVIEW.pos);
  cam.lookAt(...OVERVIEW.target);
  cam.updateMatrixWorld();
  const dir = new Vector3(sx * 2 - 1, -(sy * 2 - 1), 0.5).unproject(cam).sub(cam.position).normalize();
  return cam.position.clone().addScaledVector(dir, distance);
}

/** Feet of the explorer, snapped to the ledge's block grid so they stand on a block top. */
export function explorerFeet(): Vector3 {
  const at = screenPoint(...EXPLORER_SPOT.screen, EXPLORER_SPOT.distance);
  return at.set(Math.round(at.x / B) * B, Math.round(at.y / B) * B, Math.round(at.z / B) * B);
}
