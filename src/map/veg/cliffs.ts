import { traceSource } from '../../feedback/sourceTrace';
import { BARK, LEAF, MOSS } from '../../kit/palette';
import { hash3, pick } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { CELL, fbm, SURFACE, type HeightField } from '../heightfield';
import { PLACES } from '../layout';
import { FACE_Z_MIN } from '../terrain/views';
import { lodAt } from './scatter';

/**
 * Green on the cliffs: moss cushions over the lips and curtains of vines and
 * lianas hanging down the walls, like the concept art's overgrown mesas.
 * Only on walls a camera can see: facing south, east or west, and north
 * where the roaming camera goes (views.ts `FACE_Z_MIN`).
 */

const VINE = [...BARK.vine, LEAF.jungle[0], LEAF.jungle[3], LEAF.dark[2], LEAF.bright[4]];
const MOSS_TONES = [...MOSS, LEAF.bright[4], LEAF.jungle[3]];

/** Wall directions: neighbour offset (cells) and the face normal. */
const WALLS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Build the greens, each into the builder of its chunk. */
export function buildCliffGreens(f: HeightField, sink: (x: number, z: number) => VoxelBuilder, density: number): void {
  const src = traceSource();
  const { nx, nz, height } = f;
  const nearPad = (x: number, z: number) => PLACES.some((p) => Math.abs(x - p.x) < p.pad[0] + 10 && Math.abs(z - p.z) < p.pad[1] + 10);
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const h = height[c];
      const [x, z] = f.cellCenter(i, k);
      const s = f.surface[c];
      if (s === SURFACE.pad || s === SURFACE.path || f.water[c] > -1000) continue;
      for (const [di, dk] of WALLS) {
        if (dk < 0 && z - CELL / 2 <= FACE_Z_MIN) continue;
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const n = ni + nk * nx;
        const low = Math.max(height[n], f.water[n]);
        const drop = h - low;
        if (drop < CELL * 3) continue;
        if (f.surface[n] === SURFACE.path || nearPad(x, z)) continue;
        const lod = lodAt(x, h, z);
        const far = lod >= 2;
        const b = sink(x, z);
        // Wall plane and the along-wall axis.
        const wx = x + di * (CELL / 2);
        const wz = z + dk * (CELL / 2);
        const ax = dk !== 0 ? 1 : 0;
        const az = di !== 0 ? 1 : 0;
        const patch = fbm(x / 22, z / 22 + h * 0.07, 606);

        // Moss cushion over the lip.
        if (hash3(i, k, di * 3 + dk, 21) < (0.1 + 0.5 * patch) * density * [1, 0.8, 0.5, 0.25][lod]) {
          const len = 1.4 + hash3(i, k, 2, 22) * 1.2;
          const th = 0.6 + hash3(i, k, 3, 22) * 0.5;
          const out = 0.4 + hash3(i, k, 4, 22) * 0.4;
          const cx = wx - di * (0.5 - out / 2) + ax * (hash3(i, k, 5, 22) - 0.5) * 0.6;
          const cz = wz - dk * (0.5 - out / 2) + az * (hash3(i, k, 5, 22) - 0.5) * 0.6;
          const d = 1 + out;
          b.box(cx, h + th / 2 - 0.25, cz, ax ? len : d, th, az ? len : d, pick(MOSS_TONES, hash3(i, k, 6, 22)), 'mapGrass', { shade: 1.05, src });
          // A drape of moss down the wall under it.
          if (!far && hash3(i, k, 7, 22) < 0.55) {
            const dh = 1 + hash3(i, k, 8, 22) * Math.min(4, drop * 0.3);
            b.box(wx + di * 0.25, h - dh / 2 - 0.2, wz + dk * 0.25, ax ? len * 0.8 : 0.5, dh, az ? len * 0.8 : 0.5, pick(MOSS_TONES, hash3(i, k, 9, 22)), 'mapGrass', { shade: 0.9, src });
          }
        }

        // Vines: one or two strands per 2 m of wall, in curtains.
        if ((far && drop < CELL * 5) || lod === 3) continue;
        const vines = smooth(0.35, 0.62, patch) * density;
        for (let strand = 0; strand < 2; strand++) {
          if (hash3(i, k, strand + di * 5 + dk * 11, 23) > vines * [0.8, 0.55, 0.3][lod]) continue;
          const along = (strand - 0.5) * 1 + (hash3(i, k, strand, 24) - 0.5) * 0.4;
          const len = drop * (0.2 + hash3(i, k, strand, 25) * 0.6);
          let y = h + 0.3;
          let seg = 0;
          const thick = far ? 1 : 0.55;
          while (y > h - len) {
            const sh = Math.min(y - (h - len), (far ? 3 : 1.5) + hash3(i, k, seg * 7 + strand, 26) * 2);
            const wob = (hash3(i, seg, k, 27 + strand) - 0.5) * 0.35;
            const px = wx + di * (thick / 2 + 0.02) + ax * (along + wob);
            const pz = wz + dk * (thick / 2 + 0.02) + az * (along + wob);
            const w = far ? 1.4 : 0.8 + hash3(i, seg, k, 28) * 0.4;
            b.box(px, y - sh / 2, pz, ax ? w : thick, sh, az ? w : thick, pick(VINE, hash3(i, seg, k, 29 + strand)), 'mapLeaf', { shade: 0.9 + 0.2 * ((y - (h - len)) / len), src });
            y -= sh;
            seg++;
          }
          // A leafy knot at the foot of long strands.
          if (!far && len > 6 && hash3(i, k, strand, 30) < 0.5) {
            const px = wx + di * 0.5 + ax * along;
            const pz = wz + dk * 0.5 + az * along;
            b.box(px, y + 0.5, pz, 1, 1, 1, pick(VINE, hash3(i, k, strand, 31)), 'mapLeaf', { shade: 0.95, src });
          }
        }
      }
    }
}

function smooth(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
