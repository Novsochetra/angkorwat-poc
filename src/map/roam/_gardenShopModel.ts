import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { BODY_UNIT_M } from '../../world/scale';
import { KINDS, type PlantKindId } from '../garden/kinds';

/**
 * What he holds in his right fist at the nursery (roam/_gardenShop.ts: the
 * rig's `gardenShop` slot on the `propR` joint, character space, body units):
 *
 * - `heldNursery`: what he has just bought, as she hands it over: a printed
 *   packet of seeds (its colour, the vegetable on it), a cane cutting, a
 *   banana sucker with its first leaves, or a seedling in its black bag;
 * - `heldHarvest`: one of what he sells, held out to her: an eggplant, an
 *   ear of corn, a pumpkin, a sugarcane, a hand of bananas, a papaya, a
 *   guava, a mango, a jackfruit, a durian, a coconut, a bunch of sugar palm
 *   fruit, at their real sizes.
 */

/** Where the right fist is (character space, BU: the `propR` joint's rest place). */
const FIST = { x: -5.65, y: 10.6, z: 0 };
/** Metres → body units. */
const M = 1 / BODY_UNIT_M;

/** A box by its middle and size in metres, from the fist (+z out in front of him, +y up). */
function put(b: VoxelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: 'leather' | 'hat' | 'wood' | 'shirt' | 'skin' = 'leather', rot?: { rx?: number; ry?: number; rz?: number }): void {
  b.box(FIST.x + x * M, FIST.y + y * M, FIST.z + z * M, sx * M, sy * M, sz * M, color, mat, rot);
}

/** A rough ball of blocks (radius r m, `n` steps across) round (x, y, z). */
function ball(b: VoxelBuilder, x: number, y: number, z: number, r: number, color: number, dark: number, n = 3, ry = 1): void {
  const s = (2 * r) / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const u = (i + 0.5) / n - 0.5;
        const v = (j + 0.5) / n - 0.5;
        const w = (k + 0.5) / n - 0.5;
        if (u * u + v * v + w * w > 0.3) continue;
        put(b, x + u * 2 * r, y + v * 2 * r * ry, z + w * 2 * r, s * 1.02, s * ry * 1.02, s * 1.02, v < -0.2 ? dark : hash3(i, j, k, 5) > 0.75 ? dark : color);
      }
}

const PACKET: Partial<Record<PlantKindId, [number, number]>> = {
  eggplant: [0x7a3a8a, 0x5a2a6a],
  corn: [0xe8b830, 0xf0c838],
  pumpkin: [0x3f8f4a, 0xe08a2a],
};

/** What she hands him for a kind (in his fist). */
export function heldNursery(k: PlantKindId): VoxelBuilder {
  const b = new VoxelBuilder();
  const K = KINDS[k];
  switch (K.form) {
    case 'seed': {
      const [c, pic] = PACKET[k] ?? [0xd8402e, 0xf2e8a0];
      put(b, 0, -0.02, 0.05, 0.1, 0.14, 0.012, c, 'shirt');
      put(b, 0, -0.01, 0.058, 0.06, 0.06, 0.004, pic, 'shirt');
      put(b, 0, 0.05, 0.05, 0.1, 0.012, 0.014, 0xf4f0e6, 'shirt');
      break;
    }
    case 'cutting':
      put(b, 0, 0, 0.05, 0.03, 0.34, 0.03, 0x7a3a5a, 'wood');
      for (const y of [-0.1, 0.02, 0.13]) put(b, 0, y, 0.05, 0.036, 0.015, 0.036, 0xc8b878, 'wood');
      break;
    case 'pup':
      put(b, 0, -0.08, 0.06, 0.07, 0.08, 0.07, 0x8a6438, 'wood');
      put(b, 0, 0.04, 0.06, 0.045, 0.2, 0.045, 0x7a9a3a, 'leather');
      put(b, 0.04, 0.16, 0.06, 0.1, 0.03, 0.05, 0x5a9a3a, 'leather', { rz: 0.6 });
      put(b, -0.04, 0.19, 0.06, 0.1, 0.03, 0.05, 0x6aa840, 'leather', { rz: -0.5 });
      break;
    default:
      // A seedling in its black bag, held by the bag's top.
      put(b, 0, -0.06, 0.06, 0.13, 0.15, 0.13, 0x202024, 'shirt');
      put(b, 0, 0.015, 0.06, 0.11, 0.02, 0.11, 0x4a3424, 'leather');
      put(b, 0, 0.12, 0.06, 0.02, 0.2, 0.02, 0x5a4a2e, 'wood');
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        put(b, Math.sin(a) * 0.05, 0.13 + i * 0.04, 0.06 + Math.cos(a) * 0.05, 0.09, 0.02, 0.05, i === 3 && k === 'mango' ? 0x9a5232 : 0x4a8a34, 'leather', { ry: a });
      }
  }
  return b;
}

/** One of his harvest of a kind, held out to her (in his fist). */
export function heldHarvest(k: PlantKindId): VoxelBuilder {
  const b = new VoxelBuilder();
  switch (k) {
    case 'eggplant':
      put(b, 0, -0.06, 0.06, 0.06, 0.18, 0.06, 0x5a2268, 'leather', { rx: 0.2 });
      put(b, 0, 0.04, 0.05, 0.07, 0.03, 0.07, 0x4a8a34);
      break;
    case 'corn':
      put(b, 0, -0.04, 0.06, 0.06, 0.2, 0.06, 0xf0c838);
      put(b, 0.02, -0.06, 0.07, 0.04, 0.22, 0.05, 0x7ab04a, 'leather', { rz: 0.15 });
      put(b, -0.02, -0.05, 0.05, 0.04, 0.2, 0.05, 0x6a9a3a, 'leather', { rz: -0.12 });
      break;
    case 'pumpkin':
      ball(b, 0, -0.14, 0.12, 0.15, 0x4a7a3a, 0x2f5a2a, 4, 0.75);
      put(b, 0, -0.02, 0.12, 0.03, 0.05, 0.03, 0x6a4a2a, 'wood');
      break;
    case 'sugarcane':
      put(b, 0, 0.1, 0.06, 0.035, 0.7, 0.035, 0x7a3a5a, 'wood');
      for (const y of [-0.15, 0.05, 0.25, 0.42]) put(b, 0, y, 0.06, 0.04, 0.015, 0.04, 0xc8b878, 'wood');
      break;
    case 'banana':
      for (let i = 0; i < 5; i++) put(b, -0.08 + i * 0.04, -0.05, 0.1, 0.035, 0.16, 0.04, i % 2 ? 0xe8c23a : 0xf2d24a, 'leather', { rx: 0.5, rz: (i - 2) * 0.12 });
      put(b, 0, 0.02, 0.06, 0.18, 0.04, 0.05, 0x6a5a2a, 'wood');
      break;
    case 'papaya':
      ball(b, 0, -0.12, 0.1, 0.09, 0xf0a030, 0x7aa040, 3, 1.5);
      break;
    case 'guava':
      ball(b, 0, -0.04, 0.08, 0.045, 0xa8c860, 0x7a9a40, 3);
      break;
    case 'mango':
      ball(b, 0, -0.05, 0.08, 0.055, 0xf2c23a, 0xd8803a, 3, 1.3);
      put(b, 0, 0.03, 0.08, 0.01, 0.03, 0.01, 0x6a4a2a, 'wood');
      break;
    case 'jackfruit':
      ball(b, 0, -0.2, 0.18, 0.17, 0xb8b848, 0x8a8a30, 4, 1.4);
      break;
    case 'durian':
      ball(b, 0, -0.12, 0.13, 0.12, 0x8a9a3a, 0x5a6a28, 4);
      for (let i = 0; i < 6; i++) put(b, Math.sin(i) * 0.12, -0.12 + Math.cos(i * 1.7) * 0.1, 0.13 + Math.cos(i) * 0.12, 0.03, 0.03, 0.03, 0x6a6a20);
      break;
    case 'coconut':
      ball(b, 0, -0.11, 0.12, 0.11, 0x6a9a3a, 0x4a7a2a, 4);
      break;
    default:
      // Sugar palm fruit: three dark round fruit on their stalk.
      for (let i = 0; i < 3; i++) ball(b, -0.05 + i * 0.05, -0.08 - (i % 2) * 0.03, 0.08, 0.045, 0x2a2430, 0x18141c, 3);
      put(b, 0, 0.0, 0.08, 0.02, 0.06, 0.02, 0x8a9a3a, 'wood');
  }
  return b;
}
